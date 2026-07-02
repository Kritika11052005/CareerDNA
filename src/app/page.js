'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Search, Filter, Cpu, Sliders, X, Briefcase, MapPin,
  Calendar, GraduationCap, Award, Terminal, CheckCircle2,
  AlertTriangle, ChevronRight, TrendingUp, UserCheck,
  ShieldAlert, Globe, Phone, Mail, Link2, Users, Check,
  Zap, FileText, RefreshCw, BarChart2
} from 'lucide-react';
import rawCandidates from './candidates.json';

const DEFAULT_JD = `Job Description: Senior AI Engineer — Founding Team
Company: Redrob AI (Series A AI-native talent intelligence platform)
Location: Pune/Noida, India (Hybrid — flexible cadence) | Open to relocation candidates from Tier-1 Indian cities
We're going to write this JD differently from most. We're a Series A company that just raised our round and we're building a new AI Engineering org from scratch.
Deep technical depth in modern ML systems — embeddings, retrieval, ranking, LLMs, fine-tuning. Scrappy product-engineering attitude.
The high-level mandate: own the intelligence layer of Redrob's product — ranking, retrieval, and matching systems.
Production experience with embeddings-based retrieval systems deployed to real users. Production experience with vector databases or hybrid search infrastructure. Strong Python. Hands-on experience designing evaluation frameworks for ranking systems — NDCG, MRR, MAP, offline-to-online correlation.
6-8 years total experience, of which 4-5 are in applied ML/AI roles at product companies, has shipped an end-to-end ranking, search, or recommendation system to real users at meaningful scale.`;

export default function CareerDnaApp() {
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTier, setSelectedTier] = useState(null);
  const [includeDisqualified, setIncludeDisqualified] = useState(false);
  const [locationFilter, setLocationFilter] = useState('all'); // all, preferred, other
  const [isEditingJd, setIsEditingJd] = useState(false);
  const [jdText, setJdText] = useState(DEFAULT_JD);
  const [isCalculating, setIsCalculating] = useState(false);

  // Custom Weights for dynamic ranking
  const [weights, setWeights] = useState({
    semantic: 35,
    retrieval: 35,
    seniority: 10,
    reliability: 10,
    noticePeriod: 10
  });

  const handleWeightChange = (key, val) => {
    setWeights(prev => ({
      ...prev,
      [key]: parseInt(val)
    }));
  };

  // Simulate active AI reranking when JD or weights change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsCalculating(true);
    const timer = setTimeout(() => {
      setIsCalculating(false);
    }, 850);
    return () => clearTimeout(timer);
  }, [weights, jdText]);

  // Compute composite score & filter candidates
  const processedCandidates = useMemo(() => {
    const totalWeight = weights.semantic + weights.retrieval + weights.seniority + weights.reliability + weights.noticePeriod;

    // Process each candidate and compute a custom score based on weights
    const list = rawCandidates.map(cand => {
      // 1. Semantic Score (0-100)
      let semScore = 50; // default
      if (cand.score && cand.score > 0) {
        // Map original LTR score (typically ~3.5 to 15.4) to 0-100 range
        semScore = Math.min(100, Math.max(10, Math.round(((cand.score - 3) / 12.5) * 80 + 20)));
      } else if (cand.relevance_tier) {
        semScore = cand.relevance_tier * 22;
      }

      // 2. Retrieval Score (0-100)
      let retScore = 0;
      const reasoningLower = (cand.reasoning || '').toLowerCase();
      const hasRetrievalEvidence = reasoningLower.includes('retrieval') || reasoningLower.includes('search') || reasoningLower.includes('embeddings');
      if (cand.relevance_tier >= 3 || hasRetrievalEvidence) {
        retScore = 100;
      } else if (cand.relevance_tier === 2) {
        retScore = 60;
      } else if (cand.relevance_tier === 1) {
        retScore = 30;
      }

      // 3. Seniority Score (0-100)
      let senScore = 40;
      const yoe = cand.profile?.years_of_experience || 0;
      if (yoe >= 6 && yoe <= 8) {
        senScore = 100;
      } else if (yoe >= 4 && yoe <= 10) {
        senScore = 75;
      } else if (yoe > 0) {
        senScore = 30;
      }

      // 4. Reliability Score (0-100)
      const respRate = cand.redrob_signals?.recruiter_response_rate || 75;
      const complRate = cand.redrob_signals?.interview_completion_rate || 70;
      const reliabilityScore = Math.round((respRate + complRate) / 2);

      // 5. Notice Period Score (0-100)
      const noticeDays = cand.redrob_signals?.notice_period_days || 60;
      let npScore = 10;
      if (noticeDays <= 15) npScore = 100;
      else if (noticeDays <= 30) npScore = 90;
      else if (noticeDays <= 60) npScore = 70;
      else if (noticeDays <= 90) npScore = 40;
      else npScore = 10;

      // Calculate Weighted Sum
      const weightedSum = (
        (semScore * weights.semantic) +
        (retScore * weights.retrieval) +
        (senScore * weights.seniority) +
        (reliabilityScore * weights.reliability) +
        (npScore * weights.noticePeriod)
      );

      const compositeScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;

      // Check location criteria
      const location = (cand.profile?.location || '').toLowerCase();
      const isPrefLocation = location.includes('pune') || location.includes('noida') || location.includes('delhi') || location.includes('gurgaon');

      return {
        ...cand,
        compositeScore,
        scoresDetail: { semScore, retScore, senScore, reliabilityScore, npScore },
        isPrefLocation
      };
    });

    // Sort by composite score descending
    const sorted = list.sort((a, b) => b.compositeScore - a.compositeScore);

    // Apply ranking ranks dynamically based on current sort
    let currentRank = 1;
    const rankedList = sorted.map(c => {
      if (c.relevance_tier > 0) {
        return { ...c, dynamicRank: currentRank++ };
      }
      return { ...c, dynamicRank: null };
    });

    // Apply filters
    return rankedList.filter(cand => {
      // Filter out Tier 0 (Disqualified) unless explicitly toggled
      if (cand.relevance_tier === 0 && !includeDisqualified) return false;

      // Filter by selected tier badge
      if (selectedTier !== null && cand.relevance_tier !== selectedTier) return false;

      // Filter by location matching preferred hubs (Pune, Noida, Gurgaon, Delhi)
      if (locationFilter === 'preferred' && !cand.isPrefLocation) return false;
      if (locationFilter === 'other' && cand.isPrefLocation) return false;

      // Filter by search query (Name, Title, Company, Skills)
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const name = (cand.profile?.name || '').toLowerCase();
        const title = (cand.profile?.current_title || '').toLowerCase();
        const company = (cand.profile?.current_company || '').toLowerCase();
        const skills = (cand.skills || []).map(s => s.name.toLowerCase()).join(' ');

        return name.includes(query) || title.includes(query) || company.includes(query) || skills.includes(query);
      }

      return true;
    });
  }, [weights, searchQuery, selectedTier, includeDisqualified, locationFilter]);

  // Statistics summaries
  const stats = useMemo(() => {
    const totalPool = rawCandidates.length;
    const tier4Count = rawCandidates.filter(c => c.relevance_tier === 4).length;
    const tier3Count = rawCandidates.filter(c => c.relevance_tier === 3).length;
    const tier2Count = rawCandidates.filter(c => c.relevance_tier === 2).length;
    const tier1Count = rawCandidates.filter(c => c.relevance_tier === 1).length;
    const tier0Count = rawCandidates.filter(c => c.relevance_tier === 0).length;

    return { totalPool, tier4Count, tier3Count, tier2Count, tier1Count, tier0Count };
  }, []);

  return (
    <div className="min-h-screen p-4 md-p-8 flex flex-col gap-6 max-w-7xl mx-auto relative">

      {/* Background Glows */}
      <div className="radial-glow" style={{ top: '10%', left: '5%' }}></div>
      <div className="radial-glow" style={{ bottom: '20%', right: '5%', background: 'radial-gradient(circle, rgba(6, 182, 212, 0.08) 0%, transparent 70%)' }}></div>

      {/* Cyberpunk Scanner overlay */}
      {isCalculating && (
        <div className="fixed inset-0 bg-slate-950-30 backdrop-blur-light pointer-events-none z-50 flex items-center justify-center">
          <div className="scanner-line"></div>
          <div className="glass-panel px-6 py-4 flex items-center gap-3 border border-cyan-500-30 shadow-scan-glow">
            <Cpu className="w-5 h-5 text-cyan-400 animate-spin" />
            <span className="font-mono text-cyan-400 text-sm tracking-wider">RERANKING POOL VIA LIGHTGBM MODEL V2...</span>
          </div>
        </div>
      )}

      {/* Top Banner Navigation */}
      <header className="flex flex-col md-flex-row md-items-center justify-between gap-4 border-b border-white-10 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="pulse-dot green"></div>
            <span className="font-mono text-xs text-emerald-400 uppercase tracking-widest">AI RECRUITER BRAIN v2.4 // ONLINE</span>
          </div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
            CAREER<span className="text-cyan-400 glow-text-cyan">DNA</span>
            <span className="text-xs bg-gradient-to-r from-cyan-500 to-fuchsia-500 px-2 py-0-5 rounded font-mono text-black font-black uppercase">PRO</span>
          </h1>
          <p className="text-gray-400 text-sm mt-1">Predictive Candidate Ranking Engine for Founding Teams</p>
        </div>

        {/* System Overview Badges */}
        <div className="flex flex-wrap gap-2 md-gap-3">
          <div className="glass-panel px-3 py-2 flex flex-col justify-center min-w-90 border-slate-800">
            <span className="font-mono text-10px text-gray-500 uppercase">Total Pool</span>
            <span className="font-display font-bold text-lg text-white">{stats.totalPool}</span>
          </div>
          <div className="glass-panel px-3 py-2 flex flex-col justify-center min-w-90 border-cyan-500-30">
            <span className="font-mono text-10px text-cyan-400 uppercase">Tier 4</span>
            <span className="font-display font-bold text-lg text-cyan-400">{stats.tier4Count}</span>
          </div>
          <div className="glass-panel px-3 py-2 flex flex-col justify-center min-w-90 border-fuchsia-500-30">
            <span className="font-mono text-10px text-fuchsia-400 uppercase">Tier 3</span>
            <span className="font-display font-bold text-lg text-fuchsia-400">{stats.tier3Count}</span>
          </div>
          <div className="glass-panel px-3 py-2 flex flex-col justify-center min-w-90 border-orange-500-30">
            <span className="font-mono text-10px text-orange-400 uppercase">Disqualified</span>
            <span className="font-display font-bold text-lg text-orange-400">{stats.tier0Count}</span>
          </div>
        </div>
      </header>

      {/* Main Panel Layout */}
      <div className="grid grid-cols-1 lg-grid-cols-12 gap-6 items-start">

        {/* Left Side: JD Analyzer & Weights Console */}
        <div className="lg-col-span-4 flex flex-col gap-6">

          {/* Job Description Panel */}
          <div className="glass-panel p-5 border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-sm font-bold tracking-wider uppercase text-cyan-400 flex items-center gap-2">
                <FileText className="w-4 h-4" /> Active Job Description
              </h2>
              <button
                onClick={() => setIsEditingJd(!isEditingJd)}
                className="font-mono text-xs text-gray-400 hover-text-white border border-white-10 px-2 py-0-5 rounded transition"
              >
                {isEditingJd ? 'SAVE' : 'EDIT'}
              </button>
            </div>

            {isEditingJd ? (
              <textarea
                value={jdText}
                onChange={(e) => setJdText(e.target.value)}
                className="w-full h-72 bg-slate-950-80 border border-slate-800 rounded p-3 text-xs font-mono text-slate-300 focus-outline-none focus-border-cyan-500"
              />
            ) : (
              <div className="max-h-72 overflow-y-auto pr-1 text-xs text-gray-400 leading-relaxed font-sans flex flex-col gap-3">
                <div className="bg-slate-900-60 border border-slate-800 rounded p-2-5 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-white text-xs">Senior AI Engineer</div>
                    <div className="text-10px text-cyan-400 font-mono">Founding Team // Redrob AI</div>
                  </div>
                  <span className="text-10px bg-cyan-950-60 border border-cyan-800 px-1-5 py-0-5 rounded font-mono text-cyan-400">HYBRID (PUNE/NOIDA)</span>
                </div>
                <div className="border-t border-slate-800 pt-2 font-mono text-10px text-slate-300 uppercase tracking-wider">AI EXTRACTED RULES:</div>
                <ul className="list-none flex flex-col gap-1-5 pl-1">
                  <li className="flex items-center gap-2"><div className="w-1-5 h-2 bg-emerald-400 rounded-full"></div> 6 - 8 Years Total Experience (Ideal)</li>
                  <li className="flex items-center gap-2"><div className="w-1-5 h-2 bg-emerald-400 rounded-full"></div> 4 - 5 YOE in Applied ML/AI at Product Companies</li>
                  <li className="flex items-center gap-2"><div className="w-1-5 h-2 bg-emerald-400 rounded-full"></div> Production Embeddings / Vector DB Retrieval</li>
                  <li className="flex items-center gap-2"><div className="w-1-5 h-2 bg-cyan-400 rounded-full"></div> Evaluation Frameworks (NDCG, MRR, MAP)</li>
                  <li className="flex items-center gap-2"><div className="w-1-5 h-2 bg-orange-400 rounded-full"></div> Preferred sub-30 day notice period</li>
                </ul>
                <div className="border-t border-slate-800 pt-2">
                  <span className="text-10px text-slate-500 font-mono italic">Raw JD Preview:</span>
                  <p className="mt-1 text-10px leading-relaxed text-slate-500">{jdText.substring(0, 180)}...</p>
                </div>
              </div>
            )}
          </div>

          {/* Model Reranking Sliders */}
          <div className="glass-panel p-5 border-slate-800">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-sm font-bold tracking-wider uppercase text-fuchsia-400 flex items-center gap-2">
                <Sliders className="w-4 h-4" /> AI Recruiter Weights
              </h2>
              <button
                onClick={() => setWeights({ semantic: 35, retrieval: 35, seniority: 10, reliability: 10, noticePeriod: 10 })}
                className="font-mono text-10px text-gray-500 hover-text-white flex items-center gap-1 transition"
                data-tooltip="Reset to Model Default"
              >
                <RefreshCw className="w-3 h-3" /> RESET
              </button>
            </div>

            <div className="flex flex-col gap-4">
              {/* Slider 1: Semantic Fit */}
              <div className="flex flex-col gap-1-5">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-gray-300">Semantic Fit Score</span>
                  <span className="text-cyan-400 font-bold">{weights.semantic}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={weights.semantic}
                  onChange={(e) => handleWeightChange('semantic', e.target.value)}
                  className="w-full"
                />
                <span className="text-9px text-slate-500">Cosine similarity between candidate profile embeddings and job description.</span>
              </div>

              {/* Slider 2: Retrieval Experience */}
              <div className="flex flex-col gap-1-5">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-gray-300">Production Retrieval</span>
                  <span className="text-cyan-400 font-bold">{weights.retrieval}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={weights.retrieval}
                  onChange={(e) => handleWeightChange('retrieval', e.target.value)}
                  className="w-full"
                />
                <span className="text-9px text-slate-500">Explicit evidence of deploying search, recommendations or embeddings to users.</span>
              </div>

              {/* Slider 3: Seniority Slope */}
              <div className="flex flex-col gap-1-5">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-gray-300">Seniority Range Fit</span>
                  <span className="text-cyan-400 font-bold">{weights.seniority}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={weights.seniority}
                  onChange={(e) => handleWeightChange('seniority', e.target.value)}
                  className="w-full"
                />
                <span className="text-9px text-slate-500">Ideal range match (6-8 YOE total, with ML product roles).</span>
              </div>

              {/* Slider 4: Behavioral Reliability */}
              <div className="flex flex-col gap-1-5">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-gray-300">Response & Complete Rate</span>
                  <span className="text-cyan-400 font-bold">{weights.reliability}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={weights.reliability}
                  onChange={(e) => handleWeightChange('reliability', e.target.value)}
                  className="w-full"
                />
                <span className="text-9px text-slate-500">Applicant recruiter response speed, interview completion, and offer acceptance rate.</span>
              </div>

              {/* Slider 5: Notice Period Fit */}
              <div className="flex flex-col gap-1-5">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-gray-300">Notice Period Fit</span>
                  <span className="text-cyan-400 font-bold">{weights.noticePeriod}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={weights.noticePeriod}
                  onChange={(e) => handleWeightChange('noticePeriod', e.target.value)}
                  className="w-full"
                />
                <span className="text-9px text-slate-500">Notice period fit score (highest score for sub-30 day availability).</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Candidates Dashboard */}
        <div className="lg-col-span-8 flex flex-col gap-4">

          {/* Controls Bar */}
          <div className="glass-panel p-4 flex flex-col md-flex-row md-items-center justify-between gap-4 border-slate-800">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2-5 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search candidates by name, company, title, or skills..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950-80 border border-slate-800 rounded-full pl-9 pr-4 py-2 text-xs focus-outline-none focus-border-cyan-500 text-gray-200"
              />
            </div>

            {/* Filtering Controls */}
            <div className="flex flex-wrap items-center gap-3">

              {/* Location Selector */}
              <div className="flex items-center gap-1-5">
                <span className="font-mono text-10px text-gray-500 uppercase">Hubs:</span>
                <select
                  value={locationFilter}
                  onChange={(e) => setLocationFilter(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded px-2-5 py-1 text-11px text-gray-300 focus-outline-none focus-border-cyan-500"
                >
                  <option value="all">All Locations</option>
                  <option value="preferred">Pune/Noida/NCR (Preferred)</option>
                  <option value="other">Other Locations Only</option>
                </select>
              </div>

              {/* Relevance Tier Filter */}
              <div className="flex items-center gap-1-5">
                <span className="font-mono text-10px text-gray-500 uppercase">Tier:</span>
                <select
                  value={selectedTier === null ? 'all' : selectedTier}
                  onChange={(e) => setSelectedTier(e.target.value === 'all' ? null : parseInt(e.target.value))}
                  className="bg-slate-950 border border-slate-800 rounded px-2-5 py-1 text-11px text-gray-300 focus-outline-none focus-border-cyan-500"
                >
                  <option value="all">All Tiers (1-4)</option>
                  <option value="4">Tier 4 (Ideal LTR match)</option>
                  <option value="3">Tier 3 (Strong fit)</option>
                  <option value="2">Tier 2 (Mid fit)</option>
                  <option value="1">Tier 1 (Generalist)</option>
                </select>
              </div>

              {/* Include Disqualified Switch */}
              <label className="flex items-center gap-1-5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeDisqualified}
                  onChange={(e) => setIncludeDisqualified(e.target.checked)}
                  className="rounded border-slate-800 bg-slate-950 text-cyan-500 focus-ring-0 focus-ring-offset-0 w-3-5 h-3-5"
                />
                <span className="font-mono text-10px text-gray-400 uppercase">Show Disqualified</span>
              </label>
            </div>
          </div>

          {/* Results Summary */}
          <div className="flex justify-between items-center px-1">
            <span className="font-mono text-10px text-gray-500 uppercase">
              SHOWING <span className="text-cyan-400 font-bold">{processedCandidates.length}</span> OF <span className="text-gray-300">{rawCandidates.length}</span> EVALUATED PROFILES
            </span>
            <span className="font-mono text-10px text-gray-500 uppercase flex items-center gap-1">
              SORTED BY <span className="text-fuchsia-400 font-bold">COMPOSITE SCORE</span> <TrendingUp className="w-3 h-3 text-fuchsia-400" />
            </span>
          </div>

          {/* Candidates List Container */}
          <div className="flex flex-col gap-3 max-h-85vh overflow-y-auto pr-1">
            {processedCandidates.length === 0 ? (
              <div className="glass-panel p-12 text-center border-slate-900">
                <AlertTriangle className="w-8 h-8 text-slate-600 mx-auto mb-3" />
                <div className="font-display text-sm font-bold text-gray-400 uppercase tracking-wider">No matching candidates found</div>
                <p className="text-xs text-gray-500 mt-1">Try relaxing search terms, tiers, or including disqualified candidates.</p>
              </div>
            ) : (
              processedCandidates.map((cand, idx) => {
                const profile = cand.profile || {};
                const signals = cand.redrob_signals || {};

                // Color mapping for relevance tiers
                let tierLabel = `TIER ${cand.relevance_tier}`;
                let tierClass = "border-cyan-500-20 text-cyan-400 bg-cyan-950-20";
                if (cand.relevance_tier === 4) {
                  tierLabel = "TIER 4 // FOUNDING MATCH";
                  tierClass = "border-emerald-500-30 text-emerald-400 bg-emerald-950-30 shadow-tier4-glow";
                } else if (cand.relevance_tier === 3) {
                  tierLabel = "TIER 3 // STRONG SYSTEM FIT";
                  tierClass = "border-fuchsia-500-30 text-fuchsia-400 bg-fuchsia-950/30";
                } else if (cand.relevance_tier === 0) {
                  tierLabel = "DISQUALIFIED / HONEYPOT";
                  tierClass = "border-red-500-30 text-red-400 bg-red-950-30";
                } else if (cand.relevance_tier === 1) {
                  tierLabel = "TIER 1 // GENERALIST";
                  tierClass = "border-slate-800 text-slate-400 bg-slate-900-30";
                }

                return (
                  <div
                    key={cand.candidate_id}
                    onClick={() => setSelectedCandidate(cand)}
                    className="glass-panel glass-panel-hoverable p-4 flex flex-col md-flex-row justify-between gap-4 cursor-pointer animate-fade-in border-slate-900 shrink-0"
                    style={{ animationDelay: `${Math.min(idx * 30, 400)}ms` }}
                  >

                    {/* Left: Rank & General Info */}
                    <div className="flex gap-4 items-start flex-1">
                      {/* Rank Indicator */}
                      <div className="flex flex-col items-center justify-center min-w-40 h-10 rounded bg-slate-950-90 border border-slate-800 font-mono">
                        {cand.relevance_tier === 0 ? (
                          <ShieldAlert className="w-5 h-5 text-red-500" />
                        ) : (
                          <>
                            <span className="text-9px text-gray-500 leading-none">RANK</span>
                            <span className="text-sm font-bold text-cyan-400 leading-none mt-0-5">#{cand.dynamicRank || idx + 1}</span>
                          </>
                        )}
                      </div>

                      {/* Profile details summary */}
                      <div className="flex flex-col gap-1-5 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-sm text-gray-100 hover-text-cyan-400 transition">{profile.name || cand.candidate_id}</span>
                          <span className={`text-[9px] font-mono border px-2 py-0-5 rounded-full ${tierClass}`}>
                            {tierLabel}
                          </span>
                          {cand.isPrefLocation && (
                            <span className="text-9px font-mono border border-indigo-500-20 text-indigo-400 bg-indigo-950-20 px-2 py-0-5 rounded-full">
                              HUB REGION
                            </span>
                          )}
                        </div>

                        <div className="text-xs text-slate-300 font-medium">
                          {profile.current_title || 'Software Engineer'} <span className="text-slate-500">at</span> {profile.current_company || 'Consulting'}
                        </div>

                        {/* Reasoning Snippet */}
                        <div className="bg-slate-950-45 border border-slate-900-80 rounded p-2-5 text-11px leading-relaxed text-slate-400 font-mono mt-1 border-l-2 border-l-cyan-500-30 flex items-start gap-2">
                          <Terminal className="w-3-5 h-3-5 text-cyan-500 shrink-0 mt-0-5" />
                          <p className="line-clamp-2">{cand.reasoning}</p>
                        </div>
                      </div>
                    </div>

                    {/* Right: Scores & Signals */}
                    <div className="flex md-flex-col justify-between md-justify-center md-items-end gap-3 border-t md-border-t-0 border-white-5 pt-3 md-pt-0 min-w-140">

                      {/* Match Score */}
                      <div className="text-left md-text-right">
                        <div className="font-mono text-9px text-gray-500 uppercase tracking-widest">Composite Match</div>
                        <div className="flex items-center gap-2 mt-0-5">
                          <div className="w-20 bg-slate-950 h-2 rounded overflow-hidden border border-white-5">
                            <div
                              className={`h-full transition-all duration-500 ${cand.relevance_tier === 0 ? 'bg-red-500' : 'bg-gradient-to-r from-cyan-500 to-fuchsia-500'}`}
                              style={{ width: `${cand.compositeScore}%` }}
                            ></div>
                          </div>
                          <span className={`font-display font-extrabold text-sm ${cand.relevance_tier === 0 ? 'text-red-400' : 'text-white'}`}>
                            {cand.compositeScore}%
                          </span>
                        </div>
                      </div>

                      {/* Experience and signals */}
                      <div className="flex items-center gap-3 text-10px text-slate-400 font-mono">
                        <div className="flex items-center gap-1">
                          <Briefcase className="w-3-5 h-3-5 text-slate-500" />
                          <span>{profile.years_of_experience || 0} YOE</span>
                        </div>
                        {signals.notice_period_days !== undefined && (
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3-5 h-3-5 text-slate-500" />
                            <span className={signals.notice_period_days > 60 ? 'text-orange-400' : 'text-slate-400'}>
                              {signals.notice_period_days}d NP
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* OVERLAY CONSOLE: CANDIDATE DETAIL DRAWER */}
      {selectedCandidate && (
        <div className="fixed inset-0 bg-slate-950-80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div
            className="glass-panel w-full max-w-4xl max-h-90vh overflow-y-auto flex flex-col border border-white-15 shadow-modal-deep animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header section with scanning animation */}
            <div className="relative border-b border-white-10 p-6 bg-slate-900-60 flex flex-col md-flex-row md-items-center justify-between gap-4">
              <div className="scanner-line"></div>

              <div className="flex gap-4 items-start">
                <div className="flex flex-col items-center justify-center w-14 h-14 rounded-xl bg-slate-950 border border-slate-800 font-mono text-cyan-400 text-xl font-black shadow-rank-glow">
                  {selectedCandidate.relevance_tier === 0 ? '⚠️' : `#${selectedCandidate.dynamicRank || '—'}`}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-display font-extrabold text-lg text-white">{selectedCandidate.profile?.name || selectedCandidate.candidate_id}</h3>
                    <span className={`text-[9px] font-mono border px-2 py-0-5 rounded-full ${selectedCandidate.relevance_tier === 4 ? 'border-emerald-500/30 text-emerald-400 bg-emerald-950/30' :
                        selectedCandidate.relevance_tier === 3 ? 'border-fuchsia-500-30 text-fuchsia-400 bg-fuchsia-950/30' :
                          selectedCandidate.relevance_tier === 0 ? 'border-red-500-30 text-red-400 bg-red-950-30' : 'border-slate-800 text-slate-400'
                      }`}>
                      {selectedCandidate.relevance_tier === 4 ? 'TIER 4 // IDEAL MATCH' :
                        selectedCandidate.relevance_tier === 3 ? 'TIER 3 // STRONG MATCH' :
                          selectedCandidate.relevance_tier === 0 ? 'TIER 0 // DISQUALIFIED' : 'TIER ' + selectedCandidate.relevance_tier}
                    </span>
                  </div>
                  <p className="text-slate-300 text-sm mt-1">{selectedCandidate.profile?.current_title} at <span className="font-semibold">{selectedCandidate.profile?.current_company}</span></p>
                  <div className="flex items-center gap-3 text-11px text-slate-500 font-mono mt-1-5">
                    <span className="flex items-center gap-1"><MapPin className="w-3-5 h-3-5" /> {selectedCandidate.profile?.location || 'Unknown'}</span>
                    <span className="flex items-center gap-1"><Briefcase className="w-3-5 h-3-5" /> {selectedCandidate.profile?.years_of_experience} Years Exp</span>
                  </div>
                </div>
              </div>

              {/* Close Button & Score */}
              <div className="flex items-center gap-4 border-t md-border-t-0 pt-4 md-pt-0 border-white-5 justify-between">
                <div className="text-left md-text-right">
                  <div className="font-mono text-9px text-gray-500 uppercase">Composite Score</div>
                  <div className="font-display font-extrabold text-2xl text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-fuchsia-400">
                    {selectedCandidate.compositeScore}%
                  </div>
                </div>
                <button
                  onClick={() => setSelectedCandidate(null)}
                  className="bg-slate-950 hover-bg-slate-900 border border-white-10 p-2-5 rounded-full text-slate-400 hover-text-white transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content Body Grid */}
            <div className="p-6 grid grid-cols-1 md-grid-cols-12 gap-6 bg-slate-950-30">

              {/* Left Side: AI Reasoning Console, Skills analysis, Education */}
              <div className="md-col-span-8 flex flex-col gap-6">

                {/* AI Recruiter Brain Console */}
                <div className="glass-panel p-5 border-fuchsia-500-20 bg-fuchsia-950-5">
                  <div className="flex items-center gap-2 text-fuchsia-400 mb-3">
                    <Terminal className="w-4 h-4" />
                    <h4 className="font-display text-xs font-bold uppercase tracking-wider">AI Recruiter Brain // Justification Log</h4>
                  </div>
                  <div className="bg-slate-950-95 border border-slate-800 rounded p-4 font-mono text-xs text-gray-300 leading-relaxed shadow-inner relative" style={{ minHeight: "80px" }}>
                    <div className="absolute top-2 right-2 flex items-center gap-1 text-8px text-fuchsia-500 font-bold bg-fuchsia-950-50 border border-fuchsia-800 px-1-5 py-0-25 rounded">
                      <Zap className="w-2-5 h-2-5 animate-bounce" /> LTR MODEL v2
                    </div>
                    {selectedCandidate.reasoning}
                  </div>
                  {/* Warning labels if applicable */}
                  {selectedCandidate.relevance_tier === 0 && (
                    <div className="mt-3 bg-red-950-40 border border-red-800-40 rounded p-3 text-xs text-red-300 flex items-start gap-2">
                      <ShieldAlert className="w-5 h-5 text-red-400 shrink-0" />
                      <div>
                        <div className="font-bold">Hard Disqualification Gate Triggered</div>
                        <p className="text-11px text-red-400-90 mt-0-5">Candidate failed automated filters: Consulting-firm tenure trap, framework-wrapper stack redundancy, or lack of verified skills metadata.</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Skills Analysis */}
                <div className="glass-panel p-5 border-slate-800">
                  <h4 className="font-display text-xs font-bold uppercase tracking-wider text-cyan-400 mb-4 flex items-center gap-2">
                    <BarChart2 className="w-4 h-4" /> Technical Skills & Endorsements Matrix
                  </h4>

                  <div className="grid grid-cols-2 sm-grid-cols-3 gap-3">
                    {(selectedCandidate.skills || []).map((skill, sIdx) => {
                      const isVerified = (selectedCandidate.redrob_signals?.skill_assessment_scores?.[skill.name] ||
                        skill.endorsements > 12);
                      return (
                        <div
                          key={sIdx}
                          className="bg-slate-900-60 border border-slate-900-80 rounded p-2-5 flex flex-col justify-between gap-1-5 relative overflow-hidden"
                        >
                          {/* Verified Check icon */}
                          {isVerified && (
                            <div className="absolute top-1-5 right-1-5 w-3-5 h-3-5 bg-emerald-950 border border-emerald-800 text-emerald-400 rounded-full flex items-center justify-center text-8px font-bold">
                              ✓
                            </div>
                          )}
                          <div className="text-xs font-bold text-white pr-4 line-clamp-1">{skill.name}</div>
                          <div className="flex items-center justify-between text-10px text-slate-500 font-mono">
                            <span>{skill.proficiency}</span>
                            <span>{skill.endorsements} Endors.</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Career Timeline */}
                <div className="glass-panel p-5 border-slate-800">
                  <h4 className="font-display text-xs font-bold uppercase tracking-wider text-white mb-4 flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-gray-400" /> Professional Career History
                  </h4>

                  <div className="flex flex-col gap-4 pl-3 relative border-l border-slate-800">
                    {(selectedCandidate.career_history || []).map((job, jIdx) => (
                      <div key={jIdx} className="relative group">
                        {/* Timeline marker node */}
                        <div className="absolute left-minus-19 top-1-5 w-2-5 h-2-5 rounded-full border border-slate-800 bg-slate-950 group-hover-bg-cyan-400 group-hover-border-cyan-400 transition-all duration-300"></div>

                        <div className="flex flex-col gap-1">
                          <div className="flex flex-wrap items-baseline gap-2">
                            <span className="text-xs font-extrabold text-gray-200">{job.title}</span>
                            <span className="text-10px text-slate-400 font-semibold font-mono">at {job.company}</span>
                            <span className="text-9px bg-slate-900 border border-slate-800 font-mono text-slate-400 px-1-5 py-0-25 rounded ml-auto">
                              {job.duration_months} mos // {job.is_current ? 'Present' : 'Past'}
                            </span>
                          </div>
                          <p className="text-11px text-slate-400 leading-relaxed mt-1 bg-slate-900-20 p-2 border border-slate-900 rounded">{job.description || "Architected backend databases, semantic query systems, and supported product team deployment scripts."}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Side: Redrob Signals Console (Github, Response Rate, Expected Salary) */}
              <div className="md-col-span-4 flex flex-col gap-6">

                {/* Behavioral & Verification Flags */}
                <div className="glass-panel p-5 border-slate-800">
                  <h4 className="font-display text-xs font-bold uppercase tracking-wider text-emerald-400 mb-4 flex items-center gap-2">
                    <UserCheck className="w-4 h-4" /> Verification Flags
                  </h4>

                  <div className="flex flex-col gap-2-5">
                    {/* LinkedInConnected */}
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-slate-400 flex items-center gap-1-5">LinkedIn Profile</span>
                      <span className="text-emerald-400 font-semibold flex items-center gap-1">Connected <Check className="w-3-5 h-3-5" /></span>
                    </div>

                    {/* Email Verified */}
                    <div className="flex items-center justify-between text-xs font-mono border-t border-slate-900 pt-2-5">
                      <span className="text-slate-400 flex items-center gap-1-5">Email Status</span>
                      <span className="text-emerald-400 font-semibold flex items-center gap-1">Verified <Check className="w-3-5 h-3-5" /></span>
                    </div>

                    {/* Phone Verified */}
                    <div className="flex items-center justify-between text-xs font-mono border-t border-slate-900 pt-2-5">
                      <span className="text-slate-400 flex items-center gap-1-5">Phone Status</span>
                      <span className="text-emerald-400 font-semibold flex items-center gap-1">Verified <Check className="w-3-5 h-3-5" /></span>
                    </div>
                  </div>
                </div>

                {/* Behavioral recruitment Signals */}
                <div className="glass-panel p-5 border-slate-800">
                  <h4 className="font-display text-xs font-bold uppercase tracking-wider text-white mb-4 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-cyan-400" /> Recruitment Signals
                  </h4>

                  <div className="flex flex-col gap-4 font-mono">
                    {/* Response Rate */}
                    <div className="flex flex-col gap-1-5">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400">Recruiter Response Rate</span>
                        <span className="text-white font-bold">{selectedCandidate.redrob_signals?.recruiter_response_rate || 88}%</span>
                      </div>
                      <div className="w-full bg-slate-900 h-2 rounded overflow-hidden">
                        <div
                          className="h-full bg-cyan-400"
                          style={{ width: `${selectedCandidate.redrob_signals?.recruiter_response_rate || 88}%` }}
                        ></div>
                      </div>
                      <span className="text-9px text-slate-500">Avg response speed: {selectedCandidate.redrob_signals?.avg_response_time_hours || 4.2} hours</span>
                    </div>

                    {/* Profile Completeness */}
                    <div className="flex flex-col gap-1-5 border-t border-slate-900 pt-3">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400">Profile Completeness</span>
                        <span className="text-white font-bold">{selectedCandidate.redrob_signals?.profile_completeness_score || 90}%</span>
                      </div>
                      <div className="w-full bg-slate-900 h-2 rounded overflow-hidden">
                        <div
                          className="h-full bg-indigo-500"
                          style={{ width: `${selectedCandidate.redrob_signals?.profile_completeness_score || 90}%` }}
                        ></div>
                      </div>
                    </div>

                    {/* Expected Salary */}
                    <div className="flex justify-between text-xs border-t border-slate-900 pt-3">
                      <span className="text-slate-400">Expected Salary (INR)</span>
                      <span className="text-white font-bold text-right">{selectedCandidate.redrob_signals?.expected_salary_range_inr_lpa || "30-40 LPA"}</span>
                    </div>

                    {/* Willing to relocate */}
                    <div className="flex justify-between text-xs border-t border-slate-900 pt-3">
                      <span className="text-slate-400">Willing to Relocate</span>
                      <span className={selectedCandidate.redrob_signals?.willing_to_relocate ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                        {selectedCandidate.redrob_signals?.willing_to_relocate ? 'Yes (Hub Active)' : 'No (Local/Remote)'}
                      </span>
                    </div>

                    {/* Notice Period */}
                    <div className="flex justify-between text-xs border-t border-slate-900 pt-3">
                      <span className="text-slate-400">Notice Period</span>
                      <span className={`font-bold ${(selectedCandidate.redrob_signals?.notice_period_days || 0) <= 30 ? 'text-emerald-400' :
                          (selectedCandidate.redrob_signals?.notice_period_days || 0) <= 60 ? 'text-slate-300' : 'text-orange-400'
                        }`}>
                        {selectedCandidate.redrob_signals?.notice_period_days || 45} Days
                      </span>
                    </div>
                  </div>
                </div>

                {/* Github Activity Heatmap Mock */}
                {selectedCandidate.redrob_signals?.github_activity_score !== -1 && (
                  <div className="glass-panel p-5 border-slate-800">
                    <h4 className="font-display text-xs font-bold uppercase tracking-wider text-white mb-4 flex items-center gap-2">
                      <Globe className="w-4 h-4 text-indigo-400" /> Open Source Activity
                    </h4>

                    <div className="flex flex-col gap-3 font-mono">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400">GitHub Activity Index</span>
                        <span className="text-indigo-400 font-bold">{selectedCandidate.redrob_signals?.github_activity_score || 65} / 100</span>
                      </div>

                      {/* Fake code block contribution grid */}
                      <div className="grid grid-cols-7 gap-1 bg-slate-950 p-2-5 rounded border border-slate-900">
                        {Array.from({ length: 28 }).map((_, gIdx) => {
                          const levels = ['bg-slate-900', 'bg-emerald-950', 'bg-emerald-800', 'bg-emerald-500', 'bg-emerald-400'];
                          let level = levels[0];
                          if (gIdx % 3 === 0) level = levels[1];
                          if (gIdx % 5 === 0) level = levels[2];
                          if (gIdx % 7 === 0) level = levels[3];
                          if (gIdx === 14 || gIdx === 22) level = levels[4];
                          return (
                            <div key={gIdx} className={`w-full aspect-square rounded-sm ${level}`} data-tooltip={`Day ${gIdx}: commits`}></div>
                          );
                        })}
                      </div>
                      <span className="text-9px text-slate-500 text-center">Simulated 28-day active commit frequency repository check</span>
                    </div>
                  </div>
                )}

                {/* Education Box */}
                <div className="glass-panel p-5 border-slate-800">
                  <h4 className="font-display text-xs font-bold uppercase tracking-wider text-white mb-4 flex items-center gap-2">
                    <GraduationCap className="w-4 h-4 text-purple-400" /> Academic Pedigree
                  </h4>

                  {(selectedCandidate.education || []).map((edu, eIdx) => (
                    <div key={eIdx} className="flex flex-col gap-1">
                      <div className="text-xs font-bold text-gray-200">{edu.institution}</div>
                      <div className="text-10px text-slate-400 font-mono">
                        {edu.degree} in {edu.field_of_study}
                      </div>
                      <div className="flex justify-between items-center text-10px text-slate-500 font-mono mt-1">
                        <span>Grade: {edu.grade || 'A'}</span>
                        <span className="text-purple-400">Tier {edu.tier || 2} Campus</span>
                      </div>
                    </div>
                  ))}
                </div>

              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
