import { defineCollection, z } from 'astro:content';

const hero = defineCollection({
  type: 'data',
  schema: z.object({
    eyebrow: z.string(),
    headline: z.string(),
    headlineAccent: z.string(),
    subhead: z.string(),
    ctaLabel: z.string(),
    pendingMessage: z.string(),
  }),
});

export const collections = { hero };
