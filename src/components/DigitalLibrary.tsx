import React from "react";
import { Link } from "react-router-dom";
import { DOMAINS } from "../constants";
import { Search, ChevronRight, BookOpen } from "lucide-react";
import * as Icons from "lucide-react";

export function DigitalLibrary() {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <section className="bg-white border-b border-slate-200 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">Digital Library</h1>
            <p className="mt-6 text-lg text-slate-600">
              Explore our comprehensive repository of academic knowledge. Browse through 25+ specialized domains and thousands of peer-reviewed publications.
            </p>
            <div className="mt-8 flex items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-2 shadow-sm focus-within:border-blue-400 focus-within:bg-white transition-all">
              <div className="flex flex-1 items-center gap-3 px-4">
                <Search size={20} className="text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Search by subject, keyword, or journal title..." 
                  className="w-full bg-transparent py-3 text-base text-slate-900 outline-none placeholder:text-slate-400"
                />
              </div>
              <button className="rounded-xl bg-slate-900 px-6 py-3 text-sm font-bold text-white hover:bg-slate-800 transition-colors">
                Search Library
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Domain Grid */}
      <section className="py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-12">
            <h2 className="text-2xl font-bold text-slate-900">Browse by Domain</h2>
            <div className="text-sm font-medium text-slate-500">Showing all 25 domains</div>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {DOMAINS.map((domain) => {
              const Icon = (Icons as any)[domain.icon] || Icons.Book;
              return (
                <Link 
                  key={domain.id} 
                  to={`/domain/${domain.id}`}
                  className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-8 transition-all hover:border-blue-200 hover:shadow-xl"
                  style={{ '--domain-color': domain.themeColor } as React.CSSProperties}
                >
                  <div className="flex items-start justify-between">
                    <div 
                      className="flex h-14 w-14 items-center justify-center rounded-2xl transition-colors"
                      style={{ backgroundColor: `${domain.themeColor}10`, color: domain.themeColor }}
                    >
                      <Icon size={28} />
                    </div>
                    <ChevronRight size={20} className="text-slate-300 group-hover:text-blue-400 transition-colors" />
                  </div>
                  <h3 className="mt-8 text-xl font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{domain.name}</h3>
                  <p className="mt-4 text-sm leading-relaxed text-slate-500 line-clamp-3">{domain.description}</p>
                  
                  <div className="mt-8 grid grid-cols-2 gap-4 border-t border-slate-100 pt-6">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Journals</span>
                      <span className="text-sm font-bold text-slate-900">20+</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">E-Books</span>
                      <span className="text-sm font-bold text-slate-900">150+</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Theses</span>
                      <span className="text-sm font-bold text-slate-900">500+</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Videos</span>
                      <span className="text-sm font-bold text-slate-900">40+</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Institutional Access CTA */}
      <section className="bg-slate-900 py-24 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl bg-gradient-to-br from-blue-600 to-blue-800 p-8 md:p-16 flex flex-col lg:flex-row items-center justify-between gap-12">
            <div className="max-w-2xl text-center lg:text-left">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Institutional Access for Libraries</h2>
              <p className="mt-6 text-lg text-blue-100">
                Provide your students and faculty with unlimited access to our entire digital library. We offer IP-based authentication, remote access, and comprehensive usage reports.
              </p>
              <div className="mt-10 flex flex-wrap justify-center lg:justify-start gap-4">
                <Link to="/institutional-access" className="rounded-full bg-white px-8 py-4 text-sm font-bold text-blue-600 hover:bg-blue-50 transition-all">
                  Request a Quote
                </Link>
                <Link to="/contact" className="rounded-full border border-white/30 bg-white/10 px-8 py-4 text-sm font-bold text-white hover:bg-white/20 transition-all backdrop-blur-sm">
                  Talk to an Expert
                </Link>
              </div>
            </div>
            <div className="hidden lg:block shrink-0">
              <BookOpen size={200} className="text-white/10" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
