export function PolicyPage({ title, updated, sections }: { title: string; updated: string; sections: { h: string; p: string[] }[] }) {
  return (
    <div className="container max-w-3xl py-8 md:py-12">
      <h1 className="text-2xl font-extrabold md:text-3xl">{title}</h1>
      <p className="mt-1 text-xs text-ink-muted">آخر تحديث: {updated}</p>
      <div className="mt-6 space-y-6">
        {sections.map((s) => (
          <section key={s.h} className="tile p-5">
            <h2 className="mb-2 font-bold">{s.h}</h2>
            <ul className="list-disc space-y-1.5 pr-5 text-sm leading-7 text-ink-soft">{s.p.map((x) => <li key={x}>{x}</li>)}</ul>
          </section>
        ))}
      </div>
    </div>
  );
}
