'use client';

import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  CheckCircle,
  TrendingUp,
  AlertCircle,
  Zap,
} from 'lucide-react';
import { Subscription, SubscriptionPlan, UsageRecord, PlanTier } from '@/types';

export default function BillingPage() {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [currentPlan, setCurrentPlan] = useState<SubscriptionPlan | null>(null);
  const [usage, setUsage] = useState<UsageRecord | null>(null);
  const [availablePlans, setAvailablePlans] = useState<SubscriptionPlan[]>([]);
  const [isUpgrading, setIsUpgrading] = useState(false);

  const fetchBilling = async () => {
    try {
      const res = await fetch('/api/billing');
      const data = await res.json();
      if (data.subscription) setSubscription(data.subscription);
      if (data.currentPlan) setCurrentPlan(data.currentPlan);
      if (data.usage) setUsage(data.usage);
      if (data.availablePlans) setAvailablePlans(data.availablePlans);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchBilling();
  }, []);

  const handlePlanChange = async (newTier: PlanTier) => {
    setIsUpgrading(true);
    try {
      const res = await fetch('/api/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planTier: newTier,
        }),
      });
      const data = await res.json();
      if (data.success) {
        fetchBilling();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsUpgrading(false);
    }
  };

  const callPercentage = currentPlan && usage ? Math.min(100, Math.round((usage.calls_count / currentPlan.included_calls) * 100)) : 0;
  const smsPercentage = currentPlan && usage ? Math.min(100, Math.round((usage.sms_count / currentPlan.included_sms) * 100)) : 0;

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Subscription & Usage Billing</h1>
        <p className="text-xs text-slate-500">
          Manage your subscription tier, track metered monthly usage, and inspect overage rates.
        </p>
      </div>

      {/* Current Subscription Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Plan</div>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-2xl font-extrabold text-slate-900">{currentPlan?.name || 'Pro Plan'}</span>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-700 uppercase">
                {subscription?.status || 'Active'}
              </span>
            </div>
          </div>

          <div className="text-right sm:text-right">
            <span className="text-3xl font-extrabold text-slate-900">
              ${(currentPlan?.monthly_price_cents || 14900) / 100}
            </span>
            <span className="text-xs text-slate-500"> / month</span>
          </div>
        </div>

        {/* Usage Progress Meters */}
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          {/* Calls Meter */}
          <div>
            <div className="flex justify-between text-xs font-bold">
              <span className="text-slate-700">Missed Calls Processed</span>
              <span className="text-slate-900">
                {usage?.calls_count || 0} / {currentPlan?.included_calls || 200}
              </span>
            </div>
            <div className="mt-2 h-2 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all"
                style={{ width: `${callPercentage}%` }}
              ></div>
            </div>
            <div className="mt-1 text-[11px] text-slate-400">{callPercentage}% of monthly allotment used</div>
          </div>

          {/* SMS Meter */}
          <div>
            <div className="flex justify-between text-xs font-bold">
              <span className="text-slate-700">SMS / Qualification Segments</span>
              <span className="text-slate-900">
                {usage?.sms_count || 0} / {currentPlan?.included_sms || 1000}
              </span>
            </div>
            <div className="mt-2 h-2 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full bg-indigo-600 rounded-full transition-all"
                style={{ width: `${smsPercentage}%` }}
              ></div>
            </div>
            <div className="mt-1 text-[11px] text-slate-400">{smsPercentage}% of monthly allotment used</div>
          </div>
        </div>
      </div>

      {/* Tier Comparison & Upgrade Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {availablePlans.map((plan) => {
          const isCurrent = currentPlan?.id === plan.id;
          return (
            <div
              key={plan.id}
              className={`rounded-2xl border bg-white p-6 shadow-sm transition ${
                isCurrent ? 'border-2 border-blue-600 ring-2 ring-blue-100' : 'border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-base text-slate-900">{plan.name}</h3>
                {isCurrent && (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700 uppercase">
                    Current
                  </span>
                )}
              </div>

              <div className="mt-3 flex items-baseline">
                <span className="text-3xl font-extrabold text-slate-900">${plan.monthly_price_cents / 100}</span>
                <span className="ml-1 text-xs text-slate-500">/ mo</span>
              </div>

              <ul className="mt-6 space-y-2.5 text-xs text-slate-600">
                <li className="flex items-center gap-1.5 font-medium text-slate-900">
                  <CheckCircle className="h-4 w-4 text-blue-600" /> {plan.included_calls} missed calls / month
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle className="h-4 w-4 text-blue-600" /> {plan.included_sms} qualification SMS
                </li>
                {plan.features.map((feat, i) => (
                  <li key={i} className="flex items-center gap-1.5">
                    <CheckCircle className="h-4 w-4 text-emerald-600" /> {feat}
                  </li>
                ))}
              </ul>

              <button
                type="button"
                disabled={isCurrent || isUpgrading}
                onClick={() => handlePlanChange(plan.id)}
                className={`mt-6 w-full rounded-xl py-2.5 text-xs font-bold transition ${
                  isCurrent
                    ? 'bg-slate-100 text-slate-400 cursor-default'
                    : 'bg-blue-600 text-white hover:bg-blue-700 shadow'
                }`}
              >
                {isCurrent ? 'Current Plan' : `Switch to ${plan.name}`}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
