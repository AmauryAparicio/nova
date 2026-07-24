import { db } from "@nova/db";
import { todo } from "@nova/db/schema/todo";
import { eq } from "drizzle-orm";
import z from "zod";

import { publicProcedure, router } from "../index";

export const todoRouter = router({
  create: publicProcedure.input(z.object({ text: z.string().min(1) })).mutation(
    async ({ input }) =>
      await db.insert(todo).values({
        text: input.text,
      })
  ),

  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(
      async ({ input }) => await db.delete(todo).where(eq(todo.id, input.id))
    ),
  getAll: publicProcedure.query(async () => await db.select().from(todo)),

  toggle: publicProcedure
    .input(z.object({ completed: z.boolean(), id: z.number() }))
    .mutation(
      async ({ input }) =>
        await db
          .update(todo)
          .set({ completed: input.completed })
          .where(eq(todo.id, input.id))
    ),
});
