import Link from "next/link";

export default function NotFound() {
  return (
    <main className="py-24 text-center">
      <h1 className="font-serif text-2xl">Not found</h1>
      <p className="mt-2 text-stone-500">That project or meeting doesn&apos;t exist.</p>
      <Link href="/" className="mt-6 inline-block text-sm underline underline-offset-2">
        Back to projects
      </Link>
    </main>
  );
}
