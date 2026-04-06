import { createFileRoute } from '@tanstack/react-router'
import axios from 'redaxios'
import type { PostType } from '../../utils/posts'
import { prisma } from "../../server/db";


export const Route = createFileRoute('/api/posts')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json();
        console.info('POSTING POST... @', body)
        // if(request.body){
        //     prisma.post.create({ data: { title: request.body.id } });
        // }
        return Response.json([]);
        // return Response.json(
        //   list.map((u) => ({ id: u.id, name: u.name, email: u.email })),
        // )
      },
    },
  },
})
