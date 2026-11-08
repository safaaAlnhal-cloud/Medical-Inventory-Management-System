import React from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bell,
  CalendarClock,
  Check,
  Calculator,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Truck,
  UserCog,
  LogIn,
  ClipboardList,
} from 'lucide-react';

import heroImg from '../../assets/landing/hero-pharmacy.jpg';
import about1 from '../../assets/landing/about-1.jpg';
import about2 from '../../assets/landing/about-2.jpg';
import Logo from '../../components/landing/Logo';

const LOGIN_PATH = '/login';

const BTN_BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium cursor-pointer transition-colors [&_svg]:pointer-events-none [&_svg]:shrink-0";
const BTN_PRIMARY = `${BTN_BASE} h-9 px-6 py-2 text-sm bg-primary text-primary-foreground shadow hover:bg-primary/90`;
const BTN_HERO = `${BTN_BASE} mt-8 h-10 px-8 text-base bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80`;

const NAV = [
  { label: "Home", href: "#home" },
  { label: "About Us", href: "#about" },
  { label: "Services", href: "#services" },
  { label: "How It Works", href: "#how" },
  { label: "Contact", href: "#contact" },
];

const SERVICES = [
  { icon: Activity, title: "Real-time Inventory Tracking", body: "Every box, bottle and batch reconciled the moment it moves." },
  { icon: CalendarClock, title: "Expiration Alerts", body: "Know 30, 60 and 90 days ahead of every expiry date." },
  { icon: Calculator, title: "Average Cost Calculation", body: "Weighted average cost per unit across all received batches." },
  { icon: Bell, title: "Stock Shortage Alerts", body: "Threshold-based warnings before a critical item runs out." },
  { icon: BarChart3, title: "Comprehensive Reports", body: "Movement, consumption and waste reports ready to export." },
  { icon: UserCog, title: "Role-Based Permissions", body: "Separate admin oversight from day-to-day storekeeper work." },
];

const SERVE = [
  { n: "01", title: "Hospitals & Medical Centers", body: "Multi-department stock control with full audit trails." },
  { n: "02", title: "Private Clinics & Labs", body: "Lightweight tracking for reagents, consumables and meds." },
  { n: "03", title: "Pharmacies & Suppliers", body: "Batch, expiry and supplier records in one clean ledger." },
];

const STEPS = [
  { icon: Truck, step: "Step 1", title: "Receive Shipment", body: "Log the delivery, batch numbers and expiry dates." },
  { icon: LogIn, step: "Step 2", title: "Log into System", body: "Sign in as admin or storekeeper to your dashboard." },
  { icon: Activity, step: "Step 3", title: "Track & Monitor", body: "Watch levels, thresholds and expiries in real time." },
  { icon: ClipboardList, step: "Step 4", title: "Dispense & Report", body: "Record dispatches and export clear reports." },
];

const STATS = [
  { value: "+50", label: "Hospitals & Clinics" },
  { value: "+10,000", label: "Medical Items Tracked" },
  { value: "99.9%", label: "System Accuracy" },
  { value: "24/7", label: "Technical Support" },
];

const BADGES = [
  { icon: Activity, label: "Real-time Tracking" },
  { icon: ShieldCheck, label: "Secure & Reliable" },
  { icon: Sparkles, label: "Smarter Decisions" },
  { icon: Stethoscope, label: "Built for Healthcare" },
];

const LandingPage = () => {
  return (
    <div className="landing-page min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-card/90 backdrop-blur">
        <div className="mx-auto flex h-18 max-w-6xl items-center justify-between px-5 py-4">
          <Logo />
          <nav className="hidden items-center gap-7 text-sm font-medium text-muted-foreground lg:flex">
            {NAV.map((n) => (
              <a key={n.label} href={n.href} className="transition-colors hover:text-primary">
                {n.label}
              </a>
            ))}
          </nav>
          <Link to={LOGIN_PATH} className={BTN_PRIMARY}>
            Login
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section id="home" className="relative isolate overflow-hidden">
        <img
          src={heroImg}
          alt="Modern hospital pharmacy with organized medical supplies"
          width={1920}
          height={1088}
          className="absolute inset-0 size-full object-cover"
        />
        <div className="absolute inset-0 bg-hero-veil" />
        <div className="relative mx-auto max-w-6xl px-5 pb-32 pt-24 md:pb-40 md:pt-32">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/25 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-primary-foreground/85">
            Medical Inventory & Supply Management
          </span>
          <h1 className="mt-6 max-w-2xl text-4xl font-semibold leading-[1.08] text-primary-foreground md:text-6xl">
            Welcome to MediTrack
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-primary-foreground/85 md:text-lg">
            Smart medical inventory management made simple. Track, organize, and manage your medical
            supplies with accuracy and ease.
          </p>
          <Link to={LOGIN_PATH} className={BTN_HERO}>
            Get Started <ArrowRight className="ml-1 size-4" />
          </Link>
        </div>

        <div className="relative mx-auto -mb-10 max-w-5xl px-5">
          <div className="grid gap-3 rounded-3xl border border-border/60 bg-card/95 p-4 shadow-float backdrop-blur sm:grid-cols-2 lg:grid-cols-4 lg:rounded-full lg:px-8">
            {BADGES.map((b) => (
              <div key={b.label} className="flex items-center justify-center gap-2.5 text-sm font-semibold text-foreground">
                <b.icon className="size-4 text-accent" />
                {b.label}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* About */}
      <section id="about" className="mx-auto max-w-6xl px-5 pb-20 pt-28">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">About Us</p>
            <h2 className="mt-4 text-3xl font-semibold md:text-4xl">
              Smart inventory management for clinics and hospitals
            </h2>
            <p className="mt-5 text-muted-foreground">
              MediTrack replaces spreadsheets and paper ledgers with one accurate source of truth for
              medications, consumables and IV fluids — so clinical teams always know what is on the
              shelf, what is running low, and what expires next.
            </p>
            <ul className="mt-7 space-y-4">
              {[
                { t: "Smart Tracking", b: "Batch-level visibility across every store, room and rack." },
                { t: "Zero Waste", b: "Expiry-first dispensing guidance that protects your budget." },
              ].map((f) => (
                <li key={f.t} className="flex gap-3">
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-accent/15">
                    <Check className="size-3.5 text-accent" strokeWidth={3} />
                  </span>
                  <span>
                    <span className="font-semibold">{f.t}</span>
                    <span className="block text-sm text-muted-foreground">{f.b}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="grid gap-4 sm:grid-cols-5">
            <img
              src={about1}
              alt="Storekeeper checking medical supplies on a tablet"
              width={912}
              height={1104}
              loading="lazy"
              className="sm:col-span-3 h-72 w-full rounded-3xl object-cover shadow-card sm:h-96"
            />
            <img
              src={about2}
              alt="Medical vials on clean shelving"
              width={928}
              height={720}
              loading="lazy"
              className="sm:col-span-2 h-52 w-full self-end rounded-3xl object-cover shadow-card sm:h-72"
            />
          </div>
        </div>
      </section>

      {/* Services */}
      <section id="services" className="bg-secondary/60 py-24">
        <div className="mx-auto max-w-6xl px-5">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Our Services</p>
            <h2 className="mt-4 text-3xl font-semibold md:text-4xl">What the system offers</h2>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {SERVICES.map((s) => (
              <article key={s.title} className="card-lift rounded-3xl border border-border/70 bg-card p-7 shadow-card transition-shadow hover:shadow-float">
                <span className="grid size-11 place-items-center rounded-2xl bg-primary/8 text-primary">
                  <s.icon className="size-5" />
                </span>
                <h3 className="mt-5 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Who we serve */}
      <section className="mx-auto max-w-6xl px-5 py-24">
        <h2 className="text-3xl font-semibold md:text-4xl">Who we serve</h2>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {SERVE.map((s) => (
            <article key={s.n} className="card-lift rounded-3xl bg-pine-gradient p-8 text-primary-foreground shadow-card transition-shadow hover:shadow-float">
              <span className="font-display text-4xl font-semibold text-accent">{s.n}</span>
              <h3 className="mt-4 text-lg font-semibold text-primary-foreground">{s.title}</h3>
              <p className="mt-2 text-sm text-primary-foreground/75">{s.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="bg-secondary/60 py-24">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="text-3xl font-semibold md:text-4xl">How it works</h2>
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <div key={s.title} className="card-lift relative rounded-3xl border border-border/70 bg-card p-7 shadow-card transition-shadow hover:shadow-float">
                {i < STEPS.length - 1 && (
                  <ArrowRight className="absolute -right-5 top-1/2 hidden size-5 -translate-y-1/2 text-accent lg:block" />
                )}
                <span className="grid size-11 place-items-center rounded-2xl bg-accent/15 text-primary">
                  <s.icon className="size-5" />
                </span>
                <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-accent">{s.step}</p>
                <h3 className="mt-1.5 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="mx-auto max-w-6xl px-5 py-24">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="card-lift rounded-3xl border border-border/70 bg-card p-8 text-center shadow-card transition-shadow hover:shadow-float">
              <p className="font-display text-4xl font-semibold text-primary">{s.value}</p>
              <p className="mt-2 text-sm text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer id="contact" className="bg-primary-deep text-primary-foreground">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 md:grid-cols-3">
          <div>
            <Logo tone="light" />
            <p className="mt-4 max-w-xs text-sm text-primary-foreground/70">
              MediTrack helps healthcare teams keep every medication and supply accounted for — from
              delivery to dispensing.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">Quick Links</h3>
            <ul className="mt-4 space-y-2.5 text-sm text-primary-foreground/75">
              {NAV.map((n) => (
                <li key={n.label}>
                  <a href={n.href} className="transition-colors hover:text-accent">
                    {n.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">Contact</h3>
            <ul className="mt-4 space-y-3 text-sm text-primary-foreground/75">
              <li className="flex items-center gap-2.5">
                <MapPin className="size-4 text-accent" /> Hebron, Palestine
              </li>
              <li className="flex items-center gap-2.5">
                <Mail className="size-4 text-accent" /> support@meditrack.com
              </li>
              <li className="flex items-center gap-2.5">
                <Phone className="size-4 text-accent" /> +970 59 000 0000
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-primary-foreground/10 py-6 text-center text-xs text-primary-foreground/60">
          © 2026 MediTrack. All rights reserved.
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
