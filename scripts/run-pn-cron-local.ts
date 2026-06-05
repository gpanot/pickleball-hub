import { runPushNotificationsCron } from "../src/lib/notifications/push-cron";

async function main() {
  const result = await runPushNotificationsCron();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
