import { notFound } from "next/navigation";
import { Playground } from "./playground";

/** Component playground. Dev only: 404s in production builds. */
export default function ComponentsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Playground />;
}
