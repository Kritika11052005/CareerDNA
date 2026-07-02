def generate_reasoning_v3(row, rank):
    """v3: adds current_title + current_company as a SECOND mandatory fact-slot (alongside years-of-experience),
    since production-retrieval-evidence and GitHub facts are conditional and don't fire for every candidate --
    leaving pure numeric collisions on years/verified-count/concern for candidates without them."""
    facts = []

    # MANDATORY fact 1 -- years of experience
    yoe = row['profile_years_of_experience']
    if 6 <= yoe <= 8:
        facts.append(f"Has {yoe:.1f} years of experience, squarely in the JD's ideal 6-8 year range.")
    else:
        facts.append(f"Has {yoe:.1f} years of experience.")

    # MANDATORY fact 2 -- current role + company (near-unique combo, always available)
    title = row['profile_current_title']
    company = row['profile_current_company']
    facts.append(f"Currently working as {title} at {company}.")

    # Conditional facts (only added if they fire, same as before)
    if row.get('feat_production_retrieval_evidence', False):
        if row['relevance_tier'] == 4:
            facts.append(f"Has measurable production retrieval/ranking experience directly matching the JD's core must-have.")
        else:
            facts.append(f"Has production retrieval/search evidence aligning with the JD's embeddings-and-retrieval requirement.")

    if row['verified_skill_count'] > 0:
        facts.append(f"Has {row['verified_skill_count']} third-party-verified skill assessments, not just self-claimed proficiency.")

    if row.get('flag_product_company_only', False):
        facts.append("Has spent their entire career at product companies (not services), matching the JD's stated preference.")

    if row['sig_github_activity_score'] > 50:
        facts.append(f"Shows active GitHub engagement (activity score {row['sig_github_activity_score']:.0f}).")

    # Cap total facts: 2 mandatory + up to 2 more for top-10, 1 more otherwise
    n_extra = 2 if rank <= 10 else 1
    selected = facts[:2] + facts[2:2+n_extra]

    # Honest concern (unchanged)
    concern = None
    if row['feat_unverified_claim_ratio'] > 0.7:
        concern = "One honest concern: claims several high-proficiency skills with no verified assessment backing them."
    elif row['sig_notice_period_days'] > 30:
        concern = f"One honest concern: notice period is {row['sig_notice_period_days']:.0f} days, above the JD's stated sub-30-day preference."
    elif row['feat_location_match'] < 0.5:
        concern = "One honest concern: location is outside the JD's preferred/welcomed cities."

    tone_opener = "Included as a marginal match: " if rank > 50 else ""
    body = " ".join(selected)
    if concern:
        body += " " + concern

    return tone_opener + body
