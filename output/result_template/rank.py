"""
rank.py -- Redrob AI Hackathon, Intelligent Candidate Discovery & Ranking Challenge
Usage: python rank.py --candidates ./candidates.jsonl --out ./submission.csv --artifacts_dir ./artifacts

Constraints: <=5 min wall-clock, <=16GB RAM, CPU only, no network calls, <=5GB intermediate disk.
Restored NB-03/NB-05 validated feature formulas + tier logic, wired to v2 model artifacts
(ranker_model_v2.txt, model_features_v2.json, binned semantic similarity, corrected JD embedding row).
"""
import argparse
import json
import time
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import lightgbm as lgb

T_START = time.time()

def log(msg):
    print(f"[{time.time()-T_START:6.1f}s] {msg}", file=sys.stderr)

# ============================================================
# Constants
# ============================================================
CONSULTING_FIRMS = {'TCS', 'Infosys', 'Wipro', 'Accenture', 'Cognizant', 'Capgemini'}
LLM_WRAPPER_SKILLS = {'LangChain', 'LlamaIndex', 'Prompt Engineering', 'RAG'}
ML_AI_SKILLS = {'Machine Learning', 'Deep Learning', 'PyTorch', 'TensorFlow', 'scikit-learn', 'MLOps',
                'Feature Engineering', 'Statistical Modeling'}
NLP_IR_SKILLS = {'NLP', 'Embeddings', 'Semantic Search', 'Vector Search', 'Retrieval', 'Information Retrieval',
                  'Ranking', 'Recommendation Systems', 'Search', 'LlamaIndex', 'LangChain'}
CV_SPEECH_ROBOTICS = {'Image Classification', 'Object Detection', 'GANs', 'Computer Vision',
                        'Speech Recognition', 'TTS', 'ASR'}
GENERAL_ML_INFRA = {'MLOps', 'Docker', 'Kubernetes', 'Kubeflow', 'MLflow', 'BentoML'}
AI_SELF_PRESENTATION_KEYWORDS = ['ai engineer', 'ai/ml', 'machine learning', 'llm', 'genai', 'generative ai',
                                   'nlp', 'ai researcher', 'ai practitioner', 'artificial intelligence', 'deep learning']
ML_AI_TITLE_KEYWORDS = ['ml engineer', 'ai research engineer', 'data scientist', 'computer vision engineer',
                          'ai specialist', 'recommendation systems engineer', 'machine learning engineer',
                          'applied ml engineer', 'search engineer', 'ai engineer', 'nlp engineer', 'lead ai engineer',
                          'senior applied scientist', 'staff machine learning engineer']
TIER_RANK = {'tier_1': 4, 'tier_2': 3, 'tier_3': 2, 'tier_4': 1, 'unknown': 0}

PRODUCTION_RETRIEVAL_TEMPLATE_IDS = {5, 6, 9, 11, 12, 19, 20, 22, 25, 28, 29, 34, 35, 36, 37, 39, 41}
STRONG_RETRIEVAL_TEMPLATE_IDS = {5, 20, 29, 34, 35}

PREFERRED_LOCATIONS = {'Pune', 'Noida'}
WELCOMED_LOCATIONS = {'Hyderabad', 'Mumbai', 'Delhi', 'NCR', 'Gurgaon', 'Gurugram'}

NON_TECHNICAL_TITLES = {
    'Business Analyst', 'HR Manager', 'Mechanical Engineer', 'Accountant', 'Project Manager',
    'Customer Support', 'Operations Manager', 'Content Writer', 'Sales Executive',
    'Civil Engineer', 'Graphic Designer', 'Marketing Manager'
}
TECHNICAL_GENERALIST_TITLES = {
    'Software Engineer', 'Full Stack Developer', 'Cloud Engineer', 'Java Developer',
    '.NET Developer', 'DevOps Engineer', 'Mobile Developer', 'Frontend Engineer', 'QA Engineer'
}
TECHNICAL_DATA_TITLES = {
    'Analytics Engineer', 'Data Engineer', 'Data Analyst', 'Backend Engineer',
    'Senior Data Engineer', 'Senior Software Engineer'
}
ML_AI_TITLES = {
    'ML Engineer', 'AI Research Engineer', 'Data Scientist', 'Senior Software Engineer (ML)',
    'Computer Vision Engineer', 'Junior ML Engineer', 'AI Specialist', 'Recommendation Systems Engineer',
    'Machine Learning Engineer', 'Applied ML Engineer', 'Search Engineer', 'AI Engineer',
    'Senior Data Scientist', 'NLP Engineer', 'Senior Machine Learning Engineer', 'Senior NLP Engineer',
    'Staff Machine Learning Engineer', 'Senior AI Engineer', 'Senior Applied Scientist', 'Lead AI Engineer'
}
TECHNICAL_TITLES = TECHNICAL_GENERALIST_TITLES | TECHNICAL_DATA_TITLES | ML_AI_TITLES

ML_RELEVANT_SKILLS_CHECK_SET = {
    'NLP','Embeddings','Semantic Search','Vector Search','Retrieval','RAG','Information Retrieval',
    'LlamaIndex','LangChain','Ranking','Recommendation Systems','Search','Machine Learning','Deep Learning',
    'PyTorch','TensorFlow','scikit-learn','MLOps','Feature Engineering','Image Classification','GANs',
    'Object Detection','Computer Vision','Speech Recognition','TTS','ASR','Prompt Engineering','YOLO',
    'OpenCV','Pinecone','Weights & Biases','Kubeflow','Reinforcement Learning','Diffusion Models','pgvector','OpenSearch'
}

# ============================================================
# Disqualifier / honeypot gating (NB-02 validated versions)
# ============================================================
def seniority_rank(title):
    title_lower = title.lower()
    for marker, rank in sorted(
        {'principal': 5, 'director': 5, 'head of': 5, 'staff': 4, 'architect': 4,
         'lead': 3, 'senior': 3}.items(), key=lambda x: -x[1]):
        if marker in title_lower:
            return rank
    return 1

def is_consulting_only_career(career_history):
    companies = {job['company'] for job in career_history}
    return companies.issubset(CONSULTING_FIRMS)

def presents_as_ai_candidate(headline, summary, current_title):
    text = f"{headline} {summary} {current_title}".lower()
    return any(kw in text for kw in AI_SELF_PRESENTATION_KEYWORDS)

def is_ml_ai_practitioner_by_title(current_title, career_history):
    all_titles = [current_title] + [j['title'] for j in career_history]
    text = ' | '.join(all_titles).lower()
    return any(kw in text for kw in ML_AI_TITLE_KEYWORDS)

def hard_disq_langchain_wrapper_only(profile, career_history, skills, recency_months=12):
    if not presents_as_ai_candidate(profile['headline'], profile['summary'], profile['current_title']):
        return False
    skill_names = {s['name'] for s in skills}
    if not (skill_names & LLM_WRAPPER_SKILLS):
        return False
    pre_llm_prod_skills = (ML_AI_SKILLS | NLP_IR_SKILLS | CV_SPEECH_ROBOTICS) - LLM_WRAPPER_SKILLS
    if skill_names & pre_llm_prod_skills:
        return False
    current_jobs = [j for j in career_history if j.get('is_current')]
    recent_job = current_jobs[0] if current_jobs else max(career_history, key=lambda j: j['start_date'])
    return recent_job.get('duration_months', 999) <= recency_months

def hard_disq_closed_source_only(profile, career_history, skills, sig_github_activity_score,
                                   certifications, verified_skill_count_val):
    if not is_ml_ai_practitioner_by_title(profile['current_title'], career_history):
        return False
    if profile['years_of_experience'] < 5:
        return False
    if sig_github_activity_score != -1:
        return False
    if len(certifications) != 0:
        return False
    if verified_skill_count_val != 0:
        return False
    return True

def is_hard_disqualified(profile, career_history, skills, sig_github_activity_score,
                           certifications, verified_skill_count_val):
    return (
        hard_disq_langchain_wrapper_only(profile, career_history, skills)
        or is_consulting_only_career(career_history)
        or hard_disq_closed_source_only(profile, career_history, skills, sig_github_activity_score,
                                          certifications, verified_skill_count_val)
    )

def honeypot_expert_zero_duration(skills, threshold_months=6):
    return any(s['proficiency'] == 'expert' and s.get('duration_months', 0) <= threshold_months for s in skills)

def honeypot_yoe_mismatch(years_of_experience, career_history, tolerance_years=2.0):
    total_months = sum(job.get('duration_months', 0) for job in career_history)
    return abs(years_of_experience - total_months / 12.0) > tolerance_years

def is_honeypot_candidate(profile, career_history, skills):
    return (
        honeypot_expert_zero_duration(skills)
        or honeypot_yoe_mismatch(profile['years_of_experience'], career_history)
    )

def soft_neg_title_chasing_score(career_history, min_months=12, max_months=20):
    if len(career_history) < 2:
        return 0
    sorted_jobs = sorted(career_history, key=lambda j: j['start_date'])
    hops = 0
    for i in range(len(sorted_jobs) - 1):
        cur_rank = seniority_rank(sorted_jobs[i]['title'])
        next_rank = seniority_rank(sorted_jobs[i + 1]['title'])
        cur_duration = sorted_jobs[i].get('duration_months', 0)
        if next_rank > cur_rank and min_months <= cur_duration <= max_months:
            hops += 1
    return hops

def soft_neg_framework_tutorial_ratio(skills):
    skill_names = {s['name'] for s in skills}
    genuine_depth_skills = (NLP_IR_SKILLS | CV_SPEECH_ROBOTICS | ML_AI_SKILLS | GENERAL_ML_INFRA) - LLM_WRAPPER_SKILLS
    framework_count = len(skill_names & LLM_WRAPPER_SKILLS)
    depth_count = len(skill_names & genuine_depth_skills)
    return framework_count / (framework_count + depth_count + 1)

# ============================================================
# Structured feature functions (NB-03 validated formulas)
# ============================================================
def seniority_slope(career_history):
    if len(career_history) < 2:
        return 0.0
    sorted_jobs = sorted(career_history, key=lambda j: j['start_date'])
    ranks = [seniority_rank(j['title']) for j in sorted_jobs]
    x = np.arange(len(ranks))
    return float(np.polyfit(x, ranks, 1)[0])

def product_company_ratio(career_history):
    total_months = sum(j.get('duration_months', 0) for j in career_history)
    if total_months == 0:
        return 0.0
    product_months = sum(j.get('duration_months', 0) for j in career_history if j['company'] not in CONSULTING_FIRMS)
    return product_months / total_months

def avg_tenure_months(career_history):
    durations = [j.get('duration_months', 0) for j in career_history]
    return float(np.mean(durations)) if durations else 0.0

def recent_tenure_months(career_history):
    current = [j for j in career_history if j.get('is_current')]
    if current:
        return current[0].get('duration_months', 0)
    sorted_jobs = sorted(career_history, key=lambda j: j['start_date'])
    return sorted_jobs[-1].get('duration_months', 0)

def best_institution_tier_score(education):
    tiers = [e.get('tier') for e in education if 'tier' in e]
    if not tiers:
        return 0
    return max(TIER_RANK.get(t, 0) for t in tiers)

def location_match_score(location, country, willing_to_relocate):
    if country != 'India':
        return 0.2 if willing_to_relocate else 0.0
    if any(city in location for city in PREFERRED_LOCATIONS):
        return 1.0
    elif any(city in location for city in WELCOMED_LOCATIONS):
        return 0.85
    elif willing_to_relocate:
        return 0.6
    else:
        return 0.35

def notice_period_score(days):
    if days <= 30:
        return 1.0
    elif days <= 60:
        return 0.7
    elif days <= 90:
        return 0.45
    elif days <= 120:
        return 0.25
    else:
        return 0.1

def skill_gap_counts(skills, skill_assessment_scores):
    claimed = [s['name'] for s in skills if s['proficiency'] in ('advanced', 'expert')]
    claimed_count = len(claimed)
    verified_keys = set(skill_assessment_scores.keys())
    unverified_count = sum(1 for name in claimed if name not in verified_keys)
    verified_count = len(skill_assessment_scores)
    return claimed_count, unverified_count, verified_count

def verified_ml_relevant_count(skill_assessment_scores):
    verified_names = {k for k, v in skill_assessment_scores.items() if v is not None}
    return len(verified_names & ML_RELEVANT_SKILLS_CHECK_SET)

def ml_relevant_skill_presence(skills):
    skill_names = {s['name'] for s in skills}
    return len(skill_names & ML_RELEVANT_SKILLS_CHECK_SET) >= 2

def build_template_lookup(records):
    all_descriptions = []
    for cand in records:
        for job in cand['career_history']:
            all_descriptions.append(job['description'])
    unique_descriptions = sorted(set(all_descriptions))
    return {desc: i for i, desc in enumerate(unique_descriptions)}

def get_retrieval_evidence(career_history, template_to_id):
    has_any, has_strong = False, False
    for job in career_history:
        tid = template_to_id.get(job['description'])
        if tid in PRODUCTION_RETRIEVAL_TEMPLATE_IDS:
            has_any = True
        if tid in STRONG_RETRIEVAL_TEMPLATE_IDS:
            has_strong = True
    return has_any, has_strong

# ============================================================
# Relevance tier assignment (NB-05 validated 5-gate sequence)
# ============================================================
def assign_relevance_tier(row):
    if row['tier0_disqualified']:
        return 0

    tier4 = (
        row['must_have_retrieval_evidence_strong']
        and 6 <= row['profile_years_of_experience'] <= 8
        and row['feat_product_company_ratio'] >= 0.7
    )
    if tier4:
        return 4

    tier3 = (
        row['must_have_retrieval_evidence']
        and 4 <= row['profile_years_of_experience'] <= 10
    )
    if tier3:
        return 3

    has_some_signal = (
        row['verified_ml_relevant_count'] >= 2
        or row['ml_relevant_skill_presence']
        or row['must_have_retrieval_evidence']
    )
    tier2 = row['is_technical_title'] and has_some_signal
    if tier2:
        return 2

    return 1

# ============================================================
# Reasoning generator (NB-07 validated version)
# ============================================================
JD_CONNECTION_BY_TIER = {
    4: "matches the JD's ideal 6-8 year range with hands-on production retrieval/search work",
    3: "meets the JD's core must-have of production embeddings-and-retrieval experience",
    2: "has a genuine technical background per the JD's stated preference, though direct retrieval evidence is limited",
}

def generate_reasoning(row, rank):
    parts = []
    tone_opener = "Included as a marginal match: " if rank > 50 else ""
    parts.append(
        f"{tone_opener}{row['profile_years_of_experience']:.1f} years of experience, "
        f"currently {row['profile_current_title']} at {row['profile_current_company']}."
    )

    tier = row['relevance_tier']
    if tier in JD_CONNECTION_BY_TIER:
        parts.append(f"This candidate {JD_CONNECTION_BY_TIER[tier]}, per the JD's stated preference.")

    if row.get('must_have_retrieval_evidence'):
        parts.append("Career history shows direct evidence of production retrieval/search/embeddings work.")

    loc = row.get('profile_location', '')
    if any(p in loc for p in PREFERRED_LOCATIONS):
        parts.append(f"Located in {loc}, matching the JD's preferred location.")
    elif any(w in loc for w in WELCOMED_LOCATIONS):
        parts.append(f"Located in {loc}, within the JD's welcomed location radius.")

    concerns = []
    if row.get('sig_notice_period_days', 0) > 30:
        concerns.append(f"notice period of {int(row['sig_notice_period_days'])} days is above the JD's stated sub-30-day preference")
    if row.get('sig_github_activity_score', -1) == -1:
        concerns.append("no linked GitHub activity to independently verify hands-on work")
    if row.get('soft_neg_framework_tutorial_ratio', 0) > 0.25:
        concerns.append("skill profile leans toward framework/wrapper tools relative to systems depth")
    if concerns:
        parts.append(f"One honest concern: {concerns[0]}.")

    return " ".join(parts)

# ============================================================
# I/O
# ============================================================
def load_candidates(path):
    records = []
    opener = open
    if str(path).endswith('.gz'):
        import gzip
        opener = gzip.open
    with opener(path, 'rt', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    return records

def apply_semantic_binning(similarities, bin_edges):
    return pd.cut(similarities, bins=bin_edges, labels=False, include_lowest=True)

# ============================================================
# Main pipeline
# ============================================================
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--candidates', required=True)
    parser.add_argument('--out', required=True)
    parser.add_argument('--artifacts_dir', default='./artifacts')
    args = parser.parse_args()

    artifacts = Path(args.artifacts_dir)

    log("Loading candidates.jsonl...")
    records = load_candidates(args.candidates)
    log(f"Loaded {len(records)} candidate records.")

    log("Loading precomputed artifacts (embeddings, JD embedding, v2 model, feature list, bin edges)...")
    cand_embeddings = np.load(artifacts / "candidate_embeddings.npy")
    embed_id_order = pd.read_parquet(artifacts / "embedding_candidate_id_order.parquet")
    jd_embedding = np.load(artifacts / "jd_embedding_correct_row.npy")
    booster = lgb.Booster(model_file=str(artifacts / "ranker_model_v2.txt"))
    with open(artifacts / "model_features_v2.json") as f:
        model_features = json.load(f)
    bin_edges = np.load(artifacts / "semantic_similarity_bin_edges.npy")
    log("Artifacts loaded.")

    norms = np.linalg.norm(cand_embeddings, axis=1) * np.linalg.norm(jd_embedding)
    norms[norms == 0] = 1e-8
    sem_sim = (cand_embeddings @ jd_embedding) / norms
    sem_sim_map = dict(zip(embed_id_order['candidate_id'], sem_sim))

    log("Rebuilding template-ID lookup from full career_history corpus...")
    template_to_id = build_template_lookup(records)
    log(f"Template pool size: {len(template_to_id)} (expect 44)")

    log("Computing per-candidate raw fields + engineered features (NB-03/NB-05 validated formulas)...")
    rows = []
    for cand in records:
        cid = cand['candidate_id']
        profile = cand['profile']
        career_history = cand['career_history']
        education = cand['education']
        skills = cand['skills']
        certifications = cand['certifications']
        sig = cand['redrob_signals']
        skill_assessment_scores = sig.get('skill_assessment_scores', {})

        claimed_count, unverified_count, verified_count = skill_gap_counts(skills, skill_assessment_scores)
        has_retrieval, has_strong_retrieval = get_retrieval_evidence(career_history, template_to_id)
        github_raw = sig.get('github_activity_score', -1)

        disqualified = is_hard_disqualified(profile, career_history, skills, github_raw,
                                              certifications, verified_count)
        honeypot = is_honeypot_candidate(profile, career_history, skills)

        rows.append({
            'candidate_id': cid,
            'profile_years_of_experience': profile['years_of_experience'],
            'profile_current_title': profile['current_title'],
            'profile_current_company': profile['current_company'],
            'profile_location': profile['location'],
            'profile_country': profile['country'],
            'sig_willing_to_relocate': sig.get('willing_to_relocate', False),
            'sig_notice_period_days': sig.get('notice_period_days', 0),
            'sig_github_activity_score': github_raw,
            'sig_has_github': 1 if github_raw != -1 else 0,
            'github_score_clean': np.nan if github_raw == -1 else github_raw,
            'sig_recruiter_response_rate': sig.get('recruiter_response_rate', 0),
            'sig_interview_completion_rate': sig.get('interview_completion_rate', 0),
            'sig_offer_acceptance_rate': sig.get('offer_acceptance_rate', -1),
            'sig_verified_email': sig.get('verified_email', False),
            'sig_verified_phone': sig.get('verified_phone', False),
            'sig_linkedin_connected': sig.get('linkedin_connected', False),
            'sig_last_active_date': sig.get('last_active_date'),
            'best_institution_tier_score': best_institution_tier_score(education),
            'claimed_high_prof_skill_count': claimed_count,
            'unverified_high_prof_count': unverified_count,
            'verified_skill_count': verified_count,
            'verified_ml_relevant_count': verified_ml_relevant_count(skill_assessment_scores),
            'ml_relevant_skill_presence': ml_relevant_skill_presence(skills),
            'is_technical_title': profile['current_title'] in TECHNICAL_TITLES,
            'must_have_retrieval_evidence': has_retrieval,
            'must_have_retrieval_evidence_strong': has_strong_retrieval,
            'feat_seniority_slope': seniority_slope(career_history),
            'feat_product_company_ratio': product_company_ratio(career_history),
            'feat_avg_tenure_months': avg_tenure_months(career_history),
            'feat_recent_tenure_months': recent_tenure_months(career_history),
            'feat_location_match': location_match_score(profile['location'], profile['country'],
                                                          sig.get('willing_to_relocate', False)),
            'feat_notice_period_score': notice_period_score(sig.get('notice_period_days', 0)),
            'soft_neg_title_chasing_score': soft_neg_title_chasing_score(career_history),
            'soft_neg_framework_tutorial_ratio': soft_neg_framework_tutorial_ratio(skills),
            'semantic_similarity': sem_sim_map.get(cid, 0.0),
            'tier0_disqualified': disqualified or honeypot,
        })

    df = pd.DataFrame(rows)
    log(f"Raw/engineered fields computed for {len(df)} candidates.")

    df['feat_unverified_claim_ratio'] = np.where(
        df['claimed_high_prof_skill_count'] == 0, 0.0,
        df['unverified_high_prof_count'] / df['claimed_high_prof_skill_count'].replace(0, np.nan)
    )
    df['feat_unverified_claim_ratio'] = df['feat_unverified_claim_ratio'].fillna(0.0)

    df['sig_last_active_date'] = pd.to_datetime(df['sig_last_active_date'])
    REFERENCE_DATE = df['sig_last_active_date'].max()
    days_since_active = (REFERENCE_DATE - df['sig_last_active_date']).dt.days
    recency_score = np.clip(1 - (days_since_active / 180), 0, 1)
    offer_accept_clean = df['sig_offer_acceptance_rate'].where(df['sig_offer_acceptance_rate'] != -1, 0.5)
    verification_bonus = (
        df['sig_verified_email'].astype(int) +
        df['sig_verified_phone'].astype(int) +
        df['sig_linkedin_connected'].astype(int)
    ) / 3.0
    df['feat_behavioral_reliability'] = (
        0.25 * df['sig_recruiter_response_rate']
        + 0.25 * df['sig_interview_completion_rate']
        + 0.20 * offer_accept_clean
        + 0.20 * recency_score
        + 0.10 * verification_bonus
    )

    log("Binning semantic similarity to match trained v2 model...")
    df['feat_semantic_similarity_binned'] = apply_semantic_binning(df['semantic_similarity'].values, bin_edges)

    log("Assigning relevance tiers (NB-05 5-gate sequence)...")
    df['relevance_tier'] = df.apply(assign_relevance_tier, axis=1)
    log("Tier distribution:\n" + str(df['relevance_tier'].value_counts().sort_index()))

    # Fix: model_features_v2.json expects the NB-05-renamed column name
    # (verified_ml_relevant_skill_count), not the raw NB-03 formula name
    # (verified_ml_relevant_count) used internally by assign_relevance_tier above.
    # This mirrors the merge fix already applied in the notebook -- rank.py's own
    # df-assembly never carried the rename over.
    df['verified_ml_relevant_skill_count'] = df['verified_ml_relevant_count']

    still_missing = [c for c in model_features if c not in df.columns]
    if still_missing:
        raise ValueError(f"model_features missing from df, cannot proceed: {still_missing}")

    log("Scoring with trained v2 LightGBM ranker...")
    X = df[model_features].copy()
    bool_cols = X.select_dtypes(include='bool').columns.tolist()
    X[bool_cols] = X[bool_cols].astype(int)
    df['model_score'] = booster.predict(X)
    log("Model scoring complete.")

    eligible = df[df['relevance_tier'] > 0].copy()
    log(f"Eligible after disqualifier/honeypot gate: {len(eligible)} / {len(df)}")

    top100 = eligible.sort_values(
        'model_score', ascending=False, kind='mergesort'  # stable sort for deterministic tie-breaking
    ).head(100).reset_index(drop=True)
    top100['rank'] = top100.index + 1
    top100['score'] = top100['model_score']
    top100['reasoning'] = top100.apply(lambda row: generate_reasoning(row, row['rank']), axis=1)

    out_df = top100[['candidate_id', 'rank', 'score', 'reasoning']]
    out_df.to_csv(args.out, index=False)
    log(f"Wrote {len(out_df)} rows to {args.out}")

    assert len(out_df) == 100, f"Expected 100 rows, got {len(out_df)}"
    assert out_df['candidate_id'].is_unique, "Duplicate candidate_ids in output"
    assert (out_df['score'].diff().dropna() <= 0).all(), "Scores not non-increasing with rank"
    log("Inline validation passed.")

    elapsed = time.time() - T_START
    log(f"TOTAL RUNTIME: {elapsed:.1f}s (budget: 300s / 5min)")
    if elapsed > 300:
        log("WARNING: exceeded 5-minute budget!")

if __name__ == '__main__':
    main()
