import { queryOptions } from "@tanstack/react-query";
import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../server/db";

export type PostType = {
  id: string;
  title: string;
  body: string;
};

export const fetchPosts = createServerFn({ method: "GET" }).handler(
  async () => {
    console.info("Fetching posts...");
    return prisma.post.findMany();
  },
);

export const postsQueryOptions = () =>
  queryOptions({
    queryKey: ["posts"],
    queryFn: () => fetchPosts(),
  });

export const fetchPost = createServerFn({ method: "GET" })
  .inputValidator((d: string) => d)
  .handler(async ({ data }) => {
    console.info(`Fetching post with id ${data}...`);
    const post = await prisma.post.findUnique({ where: { id: +data } });
    return post;
  });

export const postQueryOptions = (postId: string) =>
  queryOptions({
    queryKey: ["post", postId],
    queryFn: () => fetchPost({ data: postId }),
  });
