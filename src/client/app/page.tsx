export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-zinc-950 text-zinc-100">
      <div className="max-w-xl text-center space-y-4">
        <h1 className="text-3xl font-bold tracking-tight">
          AI Interview Prep Kit
        </h1>
        <p className="text-zinc-400">
          Project foundation initialized with Next.js, Tailwind CSS, Express, and MongoDB.
        </p>
        <div className="inline-flex items-center gap-2 px-3 py-1 text-sm rounded-full bg-emerald-950/60 text-emerald-400 border border-emerald-800">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          Foundation Ready
        </div>
      </div>
    </main>
  );
}
