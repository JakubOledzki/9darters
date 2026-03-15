import "dotenv/config";

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined) {
    return fallback;
  }

  return value === "true";
}

export const config = {
  databaseUrl: process.env.DATABASE_URL ?? "mysql://9darters:9darters@localhost:3306/9darters",
  port: Number(process.env.API_PORT ?? 4000),
  appOrigin: process.env.APP_ORIGIN ?? "http://localhost:5173",
  cookieDomain: process.env.COOKIE_DOMAIN ?? "localhost",
  cookieSecure: parseBoolean(process.env.COOKIE_SECURE, false),
  sessionCookieName: "nine_darters_session",
  rankingActivityLogPath: process.env.RANKING_ACTIVITY_LOG_PATH ?? "logs/ranking-activity.log"
};

export type AppConfig = typeof config;
