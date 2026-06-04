import { sendSessionFinishedKudosNotifications } from "../src/lib/notifications/pn6-session-finished";
import { sendYouArePlayingNotifications } from "../src/lib/notifications/pn7-you-are-playing";

async function main() {
  const which = process.argv[2] ?? "both";
  if (which === "pn6" || which === "both") {
    const r6 = await sendSessionFinishedKudosNotifications();
    console.log("[PN6]", JSON.stringify(r6));
  }
  if (which === "pn7" || which === "both") {
    const r7 = await sendYouArePlayingNotifications();
    console.log("[PN7]", JSON.stringify(r7));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
