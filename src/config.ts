import dotenv from "dotenv"

dotenv.config()

export const config = {
  openAI: {
    apiToken: process.env.OPENAI_API_KEY,
  },
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: (process.env.REDIS_PORT as unknown as number) || 6379,
    db: (process.env.REDIS_DB as unknown as number) || 0,
  },
}
