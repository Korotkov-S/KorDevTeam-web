import React from "react";
import { Link } from "react-router-dom";
import { Section } from "../public/Section";

export function ProofStrip() {
  return <Section id="proof" className="!py-0">
    <div className="grid overflow-hidden rounded-[2rem] bg-[#111827] text-white md:grid-cols-12">
      <div className="p-7 sm:p-9 md:col-span-6 lg:p-12">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#a9bdff]">Не презентация, а практика</p>
        <h2 className="mt-5 max-w-xl text-balance text-3xl font-medium leading-[0.98] tracking-[-0.045em] sm:text-5xl">Сами строим продукты и отвечаем за их работу</h2>
      </div>
      <div className="grid border-t border-white/15 sm:grid-cols-2 md:col-span-6 md:border-l md:border-t-0">
        <a href="https://krasotula.com" className="group flex min-h-48 flex-col justify-between p-7 transition-colors hover:bg-[#3437ee] focus-visible:bg-[#3437ee] focus-visible:outline-none sm:p-9">
          <span className="text-sm text-white/60">Собственный продукт</span>
          <strong className="text-2xl font-medium">CRM для малого бизнеса <span aria-hidden="true">↗</span></strong>
        </a>
        <Link to="/cases/" className="group flex min-h-48 flex-col justify-between border-t border-white/15 p-7 transition-colors hover:bg-[#16713b] focus-visible:bg-[#16713b] focus-visible:outline-none sm:border-l sm:border-t-0 sm:p-9">
          <span className="text-sm text-white/60">Реальные задачи</span>
          <strong className="text-2xl font-medium">Портфолио проектов <span aria-hidden="true">↗</span></strong>
        </Link>
      </div>
    </div>
  </Section>;
}
