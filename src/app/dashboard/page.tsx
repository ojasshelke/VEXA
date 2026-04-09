"use client";

/**
 * VEXA Dashboard — Internal ops + client management.
 * Shows API key management, avatar stats, marketplace overview.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart3, Users, Zap, ShieldCheck, Key, Copy, CheckCircle2,
  Plus, Trash2, Eye, EyeOff, TrendingUp, Activity, Globe, RefreshCw,
} from 'lucide-react';
import type { DashboardStats, ApiKeyRecord } from '@/types';

const MOCK_STATS: DashboardStats = {
  totalAvatars: 14_832,
  activeMarketplaces: 3,
  tryOnsToday: 2_419,
  avgFitScore: 92.4,
  apiCallsThisMonth: 187_503,
};

const MOCK_API_KEYS: ApiKeyRecord[] = [
  { id: '1', marketplaceName: 'Myntra', key: 'vx_live_myntra_demo_key_001', createdAt: '2025-01-01', lastUsed: '2026-03-30', callCount: 89240, status: 'active' },
  { id: '2', marketplaceName: 'AJIO', key: 'vx_live_ajio_demo_key_002', createdAt: '2025-01-15', lastUsed: '2026-03-29', callCount: 52810, status: 'active' },
  { id: '3', marketplaceName: 'Amazon Fashion', key: 'vx_live_amzn_key_003', createdAt: '2025-02-10', lastUsed: '2026-03-28', callCount: 45453, status: 'active' },
];

function maskKey(key: string): string {
  return key.slice(0, 12) + '•'.repeat(12) + key.slice(-4);
}

function StatCard({ icon: Icon, label, value, trend }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; trend?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -5, transition: { duration: 0.2 } }}
      className="glass-panel p-6 rounded-2xl border border-white/5 hover:border-[#bef264]/30 transition-all duration-300 group relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 w-24 h-24 bg-[#bef264]/5 blur-3xl -mr-12 -mt-12 group-hover:bg-[#bef264]/10 transition-colors" />
      <div className="flex items-start justify-between mb-4 relative z-10">
        <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center group-hover:bg-[#bef264]/10 transition-colors border border-white/10 group-hover:border-[#bef264]/20">
          <Icon className="w-6 h-6 text-white/70 group-hover:text-[#bef264] transition-colors" />
        </div>
        {trend && (
          <span className="text-[10px] font-bold tracking-wider uppercase text-[#bef264] bg-[#bef264]/10 px-2.5 py-1 rounded-lg border border-[#bef264]/20">
            {trend}
          </span>
        )}
      </div>
      <div className="relative z-10">
        <p className="text-3xl font-bold text-white mb-1 tracking-tight">{value}</p>
        <p className="text-white/40 text-sm font-medium">{label}</p>
      </div>
    </motion.div>
  );
}

export default function DashboardPage() {
  const [keys, setKeys] = useState<ApiKeyRecord[]>(MOCK_API_KEYS);
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'keys' | 'usage'>('overview');

  const toggleReveal = (id: string) => {
    setRevealedKeys((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const copyKey = async (id: string, key: string) => {
    await navigator.clipboard.writeText(key);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const revokeKey = (id: string) => {
    setKeys((prev) => prev.map((k) => k.id === id ? { ...k, status: 'revoked' } : k));
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-8 space-y-10 relative">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-[400px] bg-[#bef264]/5 blur-[120px] rounded-full pointer-events-none -z-10" />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <motion.h1 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-4xl md:text-5xl font-black text-white tracking-tighter mb-3"
          >
            VEXA <span className="text-[#bef264]">HUB</span>
          </motion.h1>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="flex flex-wrap items-center gap-4 text-white/40"
          >
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10">
              <Activity className="w-3.5 h-3.5 text-[#bef264]" />
              <span className="text-[10px] font-black uppercase tracking-widest text-[#bef264]">System Live</span>
            </div>
            <p className="text-sm font-medium">API platform management · Last synced just now</p>
          </motion.div>
        </div>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          id="dashboard-refresh"
          className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-[#bef264] text-black font-bold text-sm transition-all hover:shadow-[0_0_30px_rgba(190,242,100,0.4)]"
        >
          <RefreshCw className="w-4 h-4" />
          Synchronize Data
        </motion.button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 p-1.5 bg-white/5 border border-white/10 rounded-2xl w-fit backdrop-blur-3xl">
        {(['overview', 'keys', 'usage'] as const).map((tab) => (
          <button
            key={tab}
            id={`dashboard-tab-${tab}`}
            onClick={() => setActiveTab(tab)}
            className={`
              relative px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all duration-300
              ${activeTab === tab ? 'text-black' : 'text-white/40 hover:text-white/70'}
            `}
          >
            {activeTab === tab && (
              <motion.div
                layoutId="activeTab"
                className="absolute inset-0 bg-[#bef264] rounded-xl"
                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
              />
            )}
            <span className="relative z-10">{tab}</span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'overview' && (
          <motion.div
            key="overview"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-8"
          >
            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard icon={Users} label="Total Avatars" value={MOCK_STATS.totalAvatars.toLocaleString()} trend="+12%" />
              <StatCard icon={Globe} label="Active Marketplaces" value={MOCK_STATS.activeMarketplaces.toString()} />
              <StatCard icon={Zap} label="Try-Ons Today" value={MOCK_STATS.tryOnsToday.toLocaleString()} trend="+8%" />
              <StatCard icon={TrendingUp} label="Avg Fit Score" value={`${MOCK_STATS.avgFitScore}%`} trend="+1.2%" />
            </div>

            {/* Pipeline Status */}
            <div className="glass-panel p-6 rounded-2xl border border-white/10">
              <h2 className="text-white font-semibold mb-4 flex items-center gap-2">
                <Activity className="w-5 h-5 text-[#bef264]" />
                Pipeline Health
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { label: 'Python Microservice', status: 'Operational', color: '#bef264' },
                  { label: 'R2 Storage', status: 'Operational', color: '#bef264' },
                  { label: 'Webhook Relay', status: 'Operational', color: '#bef264' },
                ].map((s) => (
                  <div key={s.label} className="flex items-center gap-3 p-3 rounded-xl bg-white/5">
                    <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: s.color }} />
                    <div>
                      <p className="text-white text-sm font-medium">{s.label}</p>
                      <p className="text-white/40 text-xs">{s.status}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Monthly Volume Bar Chart Stub */}
            <div className="glass-panel p-6 rounded-2xl border border-white/10">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-white font-semibold flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-[#bef264]" />
                  API Calls — Last 30 Days
                </h2>
                <span className="text-white/40 text-sm">{MOCK_STATS.apiCallsThisMonth.toLocaleString()} total</span>
              </div>
              <div className="flex items-end gap-1 h-24">
                {Array.from({ length: 30 }, (_, i) => {
                  const h = Math.random() * 80 + 10;
                  return (
                    <div
                      key={i}
                      className="flex-1 rounded-sm bg-[#bef264]/30 hover:bg-[#bef264]/60 transition-colors cursor-pointer"
                      style={{ height: `${h}%` }}
                      title={`Day ${i + 1}: ~${Math.floor(h * 62)} calls`}
                    />
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'keys' && (
          <motion.div
            key="keys"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-white font-semibold">API Keys</h2>
              <button
                id="dashboard-create-key"
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#bef264] text-black font-semibold text-sm hover:bg-[#a3e635] transition-colors"
              >
                <Plus className="w-4 h-4" />
                New Key
              </button>
            </div>

            <div className="space-y-3">
              {keys.map((record) => (
                <motion.div
                  key={record.id}
                  layout
                  className={`glass-panel p-5 rounded-2xl border transition-colors ${
                    record.status === 'revoked' ? 'border-red-500/20 opacity-60' : 'border-white/10'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-white font-semibold">{record.marketplaceName}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          record.status === 'active'
                            ? 'bg-[#bef264]/20 text-[#bef264]'
                            : 'bg-red-500/20 text-red-400'
                        }`}>
                          {record.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="text-white/50 text-xs font-mono truncate">
                          {revealedKeys.has(record.id) ? record.key : maskKey(record.key)}
                        </code>
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-white/30 text-xs">
                        <span>Created {record.createdAt}</span>
                        <span>Last used {record.lastUsed ?? 'never'}</span>
                        <span>{record.callCount.toLocaleString()} calls</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => toggleReveal(record.id)}
                        className="p-2 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                        title={revealedKeys.has(record.id) ? 'Hide key' : 'Reveal key'}
                      >
                        {revealedKeys.has(record.id) ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => copyKey(record.id, record.key)}
                        className="p-2 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                        title="Copy key"
                      >
                        {copiedId === record.id ? (
                          <CheckCircle2 className="w-4 h-4 text-[#bef264]" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                      {record.status === 'active' && (
                        <button
                          onClick={() => revokeKey(record.id)}
                          className="p-2 rounded-lg hover:bg-red-500/10 text-white/40 hover:text-red-400 transition-colors"
                          title="Revoke key"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {activeTab === 'usage' && (
          <motion.div
            key="usage"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="glass-panel p-6 rounded-2xl border border-white/10"
          >
            <h2 className="text-white font-semibold mb-4">Usage by Marketplace</h2>
            <div className="space-y-4">
              {MOCK_API_KEYS.map((k) => {
                const pct = Math.round((k.callCount / MOCK_STATS.apiCallsThisMonth) * 100);
                return (
                  <div key={k.id}>
                    <div className="flex justify-between text-sm mb-1.5">
                      <span className="text-white font-medium">{k.marketplaceName}</span>
                      <span className="text-white/50">{k.callCount.toLocaleString()} calls ({pct}%)</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                        className="h-full rounded-full bg-gradient-to-r from-[#bef264] to-[#a3e635]"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
