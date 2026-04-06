import { useSuspenseQuery, useMutation } from "@tanstack/react-query";
import { Link, Outlet, createFileRoute } from "@tanstack/react-router";
import { postsQueryOptions } from "../utils/posts";
import { prisma } from "../server/db";

export const Route = createFileRoute("/posts")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(postsQueryOptions());
  },
  head: () => ({
    meta: [{ title: "Posts" }],
  }),
  component: PostsComponent,
});

function PostsComponent() {
  const postsQuery = useSuspenseQuery(postsQueryOptions());

  const createPostMutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      console.log("Data: ", id);
      const response = await fetch("/api/posts", {
        method: "POST",
        body: JSON.stringify({ id }),
      });
      return response.json();
    },
  });

  return (
    <div>
      <div className="p-2 flex gap-2">
        <ul className="list-disc pl-4">
          {[
            ...postsQuery.data,
            { id: "i-do-not-exist", title: "Non-existent Post" },
          ].map((post) => {
            return (
              <li key={post.id} className="whitespace-nowrap">
                <Link
                  to="/posts/$postId"
                  params={{
                    postId: `${post.id}`,
                  }}
                  className="block py-1 text-blue-800 hover:text-blue-600"
                  activeProps={{ className: "text-black font-bold" }}
                >
                  <div>{post.title.substring(0, 20)}</div>
                </Link>
              </li>
            );
          })}
        </ul>
        <hr />
        <Outlet />
      </div>
      <div>
        <h2>Create Post</h2>
        <p>
          <input type="text" />
          <button
            onClick={() => {
              createPostMutation.mutate({ id: "yolokappa kappernick" });
            }}
          >
            Submit
          </button>
        </p>
      </div>
    </div>
  );
}
