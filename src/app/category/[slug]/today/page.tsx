import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCategoryBySlug } from "@/lib/board";
import {
  CategoryHeading,
  CategoryHeadingSkeleton,
  CategoryScreen,
  CategoryScreenSkeleton,
} from "@/components/board/CategoryScreen";

export async function generateMetadata({
  params,
}: PageProps<"/category/[slug]/today">): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) return { title: "Category not found" };

  return {
    title: `${category.name} — today's leaders`,
    description: `Who has paid the most in ${category.name} on Thronely since midnight UTC.`,
    alternates: { canonical: `/category/${category.slug}/today` },
  };
}

export default function CategoryTodayPage({
  params,
  searchParams,
}: PageProps<"/category/[slug]/today">) {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-20 pt-14 sm:px-6">
      <Suspense fallback={<CategoryHeadingSkeleton />}>
        <CategoryHeadingAsync params={params} />
      </Suspense>

      <Suspense fallback={<CategoryScreenSkeleton />}>
        <CategoryTodayContent params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function CategoryHeadingAsync({
  params,
}: Pick<PageProps<"/category/[slug]/today">, "params">) {
  const { slug } = await params;
  if (!slug) notFound();
  return <CategoryHeading slug={slug} period="today" />;
}

async function CategoryTodayContent({
  params,
  searchParams,
}: Pick<PageProps<"/category/[slug]/today">, "params" | "searchParams">) {
  const { slug } = await params;
  if (!slug) notFound();

  return (
    <CategoryScreen slug={slug} period="today" searchParams={searchParams} />
  );
}
