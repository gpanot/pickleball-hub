import { NextResponse } from "next/server";

// Apple App Site Association — enables Universal Links for hub.thecourtflow.com
// Paths covered: /u/* (QR profile), /join (generic), /join/* (squad invites)
export async function GET() {
  const aasa = {
    applinks: {
      apps: [],
      details: [
        {
          appIDs: ["F8VE3HCR27.com.squadd.thehub.app"],
          paths: ["/u/*", "/join", "/join/*"],
          components: [
            { "/": "/u/*" },
            { "/": "/join" },
            { "/": "/join/*" },
          ],
        },
      ],
    },
  };

  return new NextResponse(JSON.stringify(aasa, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
