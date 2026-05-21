'use client';

import { useEffect, useState } from 'react';

interface CountdownCalendarProps {
  compact?: boolean;
}

export default function CountdownCalendar({ compact = false }: CountdownCalendarProps) {
  const [days, setDays] = useState<number[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [daysLeft, setDaysLeft] = useState(0);

  useEffect(() => {
    const today = new Date();
    const month = today.getMonth() + 1;
    const year = today.getFullYear();
    const lastDay = new Date(year, month, 0).getDate();
    const currentDay = today.getDate();

    const remainingDays = [];
    for (let i = currentDay; i <= lastDay; i++) {
      remainingDays.push(i);
    }

    setDays(remainingDays);
    setDaysLeft(remainingDays.length - 1);
  }, []);

  useEffect(() => {
    if (days.length === 0) return;
    const interval = setInterval(() => {
      setCurrentIdx((prev) => (prev + 1) % days.length);
    }, 1000);
    return () => clearInterval(interval);
  }, [days.length]);

  if (days.length === 0) return null;

  if (compact) {
    return (
      <div className="bg-white/5 border border-white/10 rounded-xl p-4 transition-all duration-300 hover:bg-white/15 hover:border-fuchsia-400/50">
        <div className="flex items-center gap-4">
          <div>
            <p className="text-white/60 text-xs uppercase tracking-wider mb-1">Days Left</p>
            <div className="flex items-baseline gap-2">
              <p className="text-4xl font-black text-white tabular-nums">{daysLeft}</p>
              <p className="text-xs text-white/50">remaining</p>
            </div>
          </div>
          <div className="relative w-16 h-12 bg-white/5 rounded-lg border border-white/10 flex items-center justify-center overflow-hidden flex-shrink-0">
            {days.map((day, idx) => (
              <div
                key={day}
                className={`absolute text-lg font-bold transition-all duration-300 ${
                  idx === currentIdx
                    ? 'opacity-100 scale-100'
                    : 'opacity-0 scale-75 pointer-events-none'
                }`}
              >
                {day}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
