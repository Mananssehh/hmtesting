import { z } from "zod";

export const nicknameSchema = z
  .string()
  .trim()
  .min(2, "Nickname must be at least 2 characters")
  .max(24, "Nickname must be 24 characters or less");

export const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .length(6, "Room code is 6 characters");

export const emailSchema = z.string().trim().email("Invalid email").max(255);
export const passwordSchema = z.string().min(8, "Password must be at least 8 characters").max(72);

export const eventSchema = z.object({
  name: z.string().trim().min(2).max(80),
  venue: z.string().trim().max(80).optional().or(z.literal("")),
  dj_name: z.string().trim().min(2).max(40),
});

export const songRequestSchema = z.object({
  title: z.string().trim().min(1).max(120),
  artist: z.string().trim().min(1).max(120),
});
