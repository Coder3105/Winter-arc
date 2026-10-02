import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import mongoose from "mongoose";

import { createDefaultDailyRules } from "../src/features/winter-arc/rules";
import { createSession } from "../src/server/auth/auth-service";
import { hashPassword } from "../src/server/auth/password";
import { SESSION_COOKIE_NAME } from "../src/server/auth/session-token";
import { connectToDatabase } from "../src/server/db/mongoose";
import { createGuildPairKey } from "../src/server/services/guild-connection-service";
import { AuthSessionModel } from "../src/server/models/auth-session";
import { GuildConnectionModel } from "../src/server/models/guild-connection";
import { GuildInviteModel } from "../src/server/models/guild-invite";
import { GuildSharingPreferencesModel } from "../src/server/models/guild-sharing-preferences";
import { OwnerModel } from "../src/server/models/owner";
import { UserProfileModel } from "../src/server/models/user-profile";
import { WeeklyReportModel } from "../src/server/models/weekly-report";
import { WinterArcConfigModel } from "../src/server/models/winter-arc-config";

const baseUrl = process.env.VERIFY_BASE_URL ?? "http://127.0.0.1:3211";
const verifyInstallSystem = process.env.VERIFY_INSTALL_SYSTEM === "1";
const verifyV2Release = process.env.VERIFY_V2_8_RELEASE === "1";
const chromePath =
  process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

function waitForEndpoint(output: NodeJS.ReadableStream) {
  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Chrome debugging endpoint timeout.")),
      10_000,
    );
    output.on("data", (chunk) => {
      const match = chunk.toString().match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match?.[1]) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
  });
}

async function cdp(endpoint: string) {
  const socket = new WebSocket(endpoint);
  const pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }
  >();
  let id = 0;
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(String(data));
    if (!message.id) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request?.reject(new Error(message.error.message));
    else request?.resolve(message.result);
  };
  await new Promise<void>((resolve, reject) => {
    socket.onopen = () => resolve();
    socket.onerror = reject;
  });
  return {
    send(method: string, params: object = {}, sessionId?: string) {
      return new Promise<Record<string, unknown>>((resolve, reject) => {
        const requestId = ++id;
        pending.set(requestId, { resolve: resolve as (value: unknown) => void, reject });
        socket.send(
          JSON.stringify({
            id: requestId,
            method,
            params,
            ...(sessionId ? { sessionId } : {}),
          }),
        );
      });
    },
    close() {
      socket.close();
    },
  };
}

const fixture = randomUUID();
const firstEmail = `codex-v2-4-a-${fixture}@example.test`;
const secondEmail = `codex-v2-4-b-${fixture}@example.test`;
const setupEmail = `codex-v2-6-setup-${fixture}@example.test`;
const createdUserIds: mongoose.Types.ObjectId[] = [];
let chrome: ReturnType<typeof spawn> | null = null;
let client: Awaited<ReturnType<typeof cdp>> | null = null;
let profileDirectory: string | null = null;
await connectToDatabase();
const ownerCountBefore = await OwnerModel.countDocuments({});

try {
  const passwordHash = await hashPassword(`responsive-${fixture}`);
  const [first, second, setupOwner] = await Promise.all([
    OwnerModel.create({
      email: firstEmail,
      emailNormalized: firstEmail,
      emailVerifiedAt: new Date(),
      status: "ACTIVE",
      isOriginalOwner: false,
      passwordHash,
      displayName: "Responsive Hunter",
      isActive: true,
      lastLoginAt: new Date(),
    }),
    OwnerModel.create({
      email: secondEmail,
      emailNormalized: secondEmail,
      emailVerifiedAt: new Date(),
      status: "ACTIVE",
      isOriginalOwner: false,
      passwordHash,
      displayName: "Guild Sentinel",
      isActive: true,
      lastLoginAt: new Date(),
    }),
    OwnerModel.create({
      email: setupEmail,
      emailNormalized: setupEmail,
      emailVerifiedAt: new Date(),
      status: "ACTIVE",
      isOriginalOwner: false,
      passwordHash,
      displayName: "Setup Hunter",
      isActive: true,
      lastLoginAt: new Date(),
    }),
  ]);
  createdUserIds.push(first._id, second._id, setupOwner._id);
  await UserProfileModel.create([
    {
      userId: first._id,
      displayName: first.displayName,
      preferredWeightUnit: "kg",
      preferredDistanceUnit: "km",
      timezone: "Asia/Kolkata",
      avatarKey: "SYSTEM_HUNTER",
    },
    {
      userId: second._id,
      displayName: second.displayName,
      preferredWeightUnit: "kg",
      preferredDistanceUnit: "km",
      timezone: "Asia/Kolkata",
      avatarKey: "ICE_SENTINEL",
    },
  ]);
  const startDate = new Date("2026-10-01T00:00:00.000Z");
  const endDate = new Date("2026-12-29T00:00:00.000Z");
  await Promise.all(
    [first, second].map((owner) =>
      WinterArcConfigModel.create({
        userId: owner._id,
        name: "Responsive Winter Arc",
        durationDays: 90,
        startDate,
        endDate,
        status: "ACTIVE",
        startingWeightKg: null,
        targetWeightKg: null,
        weeklyWorkoutTarget: 4,
        rules: createDefaultDailyRules(),
        notificationPreferences: { enabled: false },
      }),
    ),
  );
  await GuildConnectionModel.create({
    userAId: first._id.toString() < second._id.toString() ? first._id : second._id,
    userBId: first._id.toString() < second._id.toString() ? second._id : first._id,
    pairKey: createGuildPairKey(first._id.toString(), second._id.toString()),
    status: "ACTIVE",
    acceptedAt: new Date(),
    removedAt: null,
    blockedByUserId: null,
  });
  await GuildInviteModel.create([
    {
      inviterUserId: second._id,
      inviteeEmailNormalized: firstEmail,
      inviteeUserId: first._id,
      status: "PENDING",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000),
      otpRequestId: "r".repeat(43),
    },
    {
      inviterUserId: first._id,
      inviteeEmailNormalized: setupEmail,
      inviteeUserId: setupOwner._id,
      status: "PENDING",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000),
      otpRequestId: "s".repeat(43),
    },
  ]);
  const session = await createSession(first._id.toString(), "v2.4-responsive-audit");
  const setupSession = await createSession(
    setupOwner._id.toString(),
    "v2.6-setup-responsive-audit",
  );

  profileDirectory = await mkdtemp(path.join(tmpdir(), "winter-arc-v2-4-responsive-"));
  chrome = spawn(
    chromePath,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--remote-debugging-port=0",
      `--user-data-dir=${profileDirectory}`,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"], windowsHide: true },
  );
  client = await cdp(await waitForEndpoint(chrome.stderr!));
  const { targetId } = await client.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await client.send("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  const browserSession = String(sessionId);
  await client.send("Page.enable", {}, browserSession);
  await client.send("Runtime.enable", {}, browserSession);
  await client.send("Network.enable", {}, browserSession);
  await client.send(
    "Network.setCookie",
    {
      name: SESSION_COOKIE_NAME,
      value: session.token,
      url: baseUrl,
      httpOnly: true,
      sameSite: "Lax",
    },
    browserSession,
  );

  async function evaluate(expression: string) {
    const response = await client!.send(
      "Runtime.evaluate",
      { expression, returnByValue: true, awaitPromise: true },
      browserSession,
    );
    if (response.exceptionDetails) throw new Error("Browser evaluation failed.");
    return (response.result as { value?: unknown })?.value;
  }

  async function waitUntil(expression: string) {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (await evaluate(expression)) return;
    }
    throw new Error("Responsive state timeout.");
  }

  async function navigate(route: string, expected: string) {
    await client!.send("Page.navigate", { url: `${baseUrl}${route}` }, browserSession);
    await waitUntil(
      `document.readyState === "complete" && document.body.innerText.includes(${JSON.stringify(expected)})`,
    );
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  async function assertLayout(label: string) {
    await waitUntil(`[...document.querySelectorAll('.identity-avatar')]
      .filter((item) => {
        const rect = item.getBoundingClientRect();
        return rect.top < innerHeight && rect.bottom > 0;
      })
      .every((item) => item.complete && item.naturalWidth > 0)`);
    const state = (await evaluate(`(() => {
      const controls = [...document.querySelectorAll(
        '.guild-page button, .guild-page input:not([type="checkbox"]), .guild-page a, .guild-sharing-row, .avatar-page button, .avatar-page a'
      )]
        .filter((item) =>
          !item.closest('.app-header') &&
          getComputedStyle(item).display !== 'none' &&
          item.getBoundingClientRect().width > 0
        );
      return {
        viewportWidth: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        minControl: controls.length ? Math.min(...controls.map((item) => item.getBoundingClientRect().height)) : 44,
        shortControls: controls
          .filter((item) => item.getBoundingClientRect().height < 43.5)
          .map((item) => ({
            tag: item.tagName,
            className: item.className,
            text: item.textContent?.trim().slice(0, 40),
            height: item.getBoundingClientRect().height
          })),
        appFrame: Boolean(document.querySelector('.app-frame, .access-screen')),
        avatarColumns: document.querySelector('.avatar-grid')
          ? getComputedStyle(document.querySelector('.avatar-grid')).gridTemplateColumns.split(' ').length
          : null,
        avatarMaxWidth: Math.max(0, ...[...document.querySelectorAll('.avatar-grid .identity-avatar')]
          .map((item) => item.getBoundingClientRect().width)),
        brokenAvatars: [...document.querySelectorAll('.identity-avatar')]
          .filter((item) => {
            const rect = item.getBoundingClientRect();
            return rect.top < innerHeight && rect.bottom > 0 &&
              (!item.complete || item.naturalWidth === 0);
          }).length
      };
    })()`)) as {
      viewportWidth: number;
      documentWidth: number;
      bodyWidth: number;
      minControl: number;
      shortControls: Array<{
        tag: string;
        className: string;
        text?: string;
        height: number;
      }>;
      appFrame: boolean;
      avatarColumns: number | null;
      avatarMaxWidth: number;
      brokenAvatars: number;
    };
    if (
      !state.appFrame ||
      state.documentWidth > state.viewportWidth ||
      state.bodyWidth > state.viewportWidth ||
      state.brokenAvatars > 0 ||
      state.minControl < 43.5 ||
      (state.avatarColumns !== null &&
        (state.avatarMaxWidth > 160 ||
          (state.viewportWidth <= 430 && state.avatarColumns !== 2) ||
          (state.viewportWidth >= 768 && state.avatarColumns < 3)))
    ) {
      throw new Error(
        `Responsive verification failed for ${label}: ${JSON.stringify(state)}.`,
      );
    }
  }

  const routes = [
    ["/profile", "OWNER PROFILE"],
    ["/profile/notifications", "NOTIFICATION PROTOCOL"],
    ["/profile/avatar", "AVATAR CATALOGUE"],
    ["/status", "SYSTEM IDENTITY"],
    ["/settings", "SYSTEM SETTINGS"],
    ["/guild", "GUILD MEMBERS"],
    ["/guild/settings", "GUILD SHARING"],
    [`/guild/${second._id}`, "GUILD MEMBER"],
    [`/guild/${second._id}/calendar`, "SHARED CALENDAR"],
    [`/guild/${second._id}/reports`, "WEEKLY REPORTS"],
    [`/guild/${second._id}/reports/week/1`, "WEEKLY EVALUATION"],
  ] as const;
  const publicRoutes = [
    ["/login", "SYSTEM ACCESS"],
    ["/register", "CREATE ACCOUNT"],
    ["/install", "INSTALL WINTER ARC"],
  ] as const;
  const viewports = verifyInstallSystem
    ? [
        { width: 320, height: 800 },
        { width: 360, height: 800 },
        { width: 375, height: 812 },
        { width: 390, height: 844 },
        { width: 393, height: 852 },
        { width: 412, height: 915 },
        { width: 430, height: 932 },
        { width: 844, height: 390 },
        { width: 768, height: 1024 },
        { width: 1024, height: 1000 },
      ]
    : (verifyV2Release
        ? [320, 360, 375, 390, 393, 412, 430, 768, 1024, 1280]
        : [320, 375, 390, 393, 430, 768, 1024]
      ).map((width) => ({
        width,
        height: 1_000,
      }));
  for (const { width, height } of viewports) {
    const androidSimulation = verifyInstallSystem && [360, 412].includes(width);
    const installMobileSimulation = verifyInstallSystem && width < 1024;
    await client.send(
      "Emulation.setDeviceMetricsOverride",
      { width, height, deviceScaleFactor: 1, mobile: width < 768 },
      browserSession,
    );
    if (verifyInstallSystem) {
      await client.send(
        "Network.setUserAgentOverride",
        installMobileSimulation
          ? androidSimulation
            ? {
                userAgent:
                  "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 Chrome/125 Mobile Safari/537.36",
                platform: "Linux armv8l",
              }
            : {
                userAgent:
                  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
                platform: width >= 768 ? "MacIntel" : "iPhone",
              }
          : {
              userAgent:
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36",
              platform: "Win32",
            },
        browserSession,
      );
      await client.send(
        "Emulation.setTouchEmulationEnabled",
        {
          enabled: installMobileSimulation,
          ...(installMobileSimulation ? { maxTouchPoints: 5 } : {}),
        },
        browserSession,
      );
      await client.send(
        "Storage.clearDataForOrigin",
        {
          origin: baseUrl,
          storageTypes: "local_storage",
        },
        browserSession,
      );
    }
    for (const [route, expected] of routes) {
      await navigate(route, expected);
      await assertLayout(`${route} at ${width}px`);
      if (verifyInstallSystem && route === "/profile") {
        if (androidSimulation) {
          const prevented = await evaluate(`(() => {
            window.__winterArcInstallPromptCalled = 0;
            const event = new Event('beforeinstallprompt', { cancelable: true });
            Object.defineProperties(event, {
              prompt: { value: async () => { window.__winterArcInstallPromptCalled += 1; } },
              userChoice: { value: Promise.resolve({ outcome: 'dismissed' }) }
            });
            window.dispatchEvent(event);
            return event.defaultPrevented;
          })()`);
          if (prevented !== true) {
            throw new Error("Android install event was not deferred.");
          }
        }
        if (installMobileSimulation) {
          await waitUntil(`Boolean(document.querySelector('.install-system-prompt'))`);
          const installState = (await evaluate(`(() => {
            const panel = document.querySelector('.install-system-prompt');
            const nav = document.querySelector('[data-mobile-navigation]');
            const panelRect = panel.getBoundingClientRect();
            const navRect = nav?.getBoundingClientRect();
            const controls = [...panel.querySelectorAll('button, a')];
            return {
              withinViewport: panelRect.top >= 0 && panelRect.bottom <= innerHeight,
              compact: panelRect.height < innerHeight * 0.6,
              minControl: Math.min(...controls.map((item) => item.getBoundingClientRect().height)),
              overlapsNavigation: navRect
                ? panelRect.bottom > navRect.top && panelRect.top < navRect.bottom
                : false
            };
          })()`)) as {
            withinViewport: boolean;
            compact: boolean;
            minControl: number;
            overlapsNavigation: boolean;
          };
          if (
            !installState.withinViewport ||
            !installState.compact ||
            installState.minControl < 43.5 ||
            installState.overlapsNavigation
          ) {
            throw new Error(
              `Install panel layout failed at ${width}x${height}: ${JSON.stringify(installState)}.`,
            );
          }
          await evaluate(
            `[...document.querySelectorAll('.install-system-prompt button')].find((item) => item.textContent.trim() === 'INSTALL SYSTEM')?.click()`,
          );
          if (androidSimulation) {
            await waitUntil(`window.__winterArcInstallPromptCalled === 1`);
            await waitUntil(`!document.querySelector('.install-system-prompt')`);
            const dismissed = await evaluate(
              `Boolean(localStorage.getItem('winter-arc:install-prompt-dismissed-at'))`,
            );
            if (dismissed !== true) {
              throw new Error("Android native dismissal cooldown was not persisted.");
            }
          } else {
            await waitUntil(
              `Boolean(document.querySelector('.install-instructions[open]'))`,
            );
            const dialogState = (await evaluate(`(() => {
              const dialog = document.querySelector('.install-instructions');
              const rect = dialog.getBoundingClientRect();
              return {
                role: dialog.getAttribute('role'),
                labelled: Boolean(dialog.getAttribute('aria-labelledby')),
                withinViewport: rect.top >= 0 && rect.bottom <= innerHeight,
                activeTitle: document.activeElement === dialog.querySelector('h2')
              };
            })()`)) as {
              role: string | null;
              labelled: boolean;
              withinViewport: boolean;
              activeTitle: boolean;
            };
            if (
              dialogState.role !== "dialog" ||
              !dialogState.labelled ||
              !dialogState.withinViewport ||
              !dialogState.activeTitle
            ) {
              throw new Error(
                `iOS instruction dialog failed at ${width}x${height}: ${JSON.stringify(dialogState)}.`,
              );
            }
            await evaluate(
              `document.querySelector('.install-instructions__close')?.click()`,
            );
            await waitUntil(`!document.querySelector('.install-instructions')`);
          }
        } else if (
          await evaluate(`Boolean(document.querySelector('.install-system-prompt'))`)
        ) {
          throw new Error("Desktop automatic install panel must remain hidden.");
        }
      }
      if (route === "/guild") {
        const inviteState = await evaluate(`(() => ({
          add: Boolean(document.querySelector('.guild-invite-form')),
          incoming: document.body.innerText.includes('Guild Sentinel'),
          outgoingMasked: document.body.innerText.includes('c***@example.test')
        }))()`);
        const guildState = inviteState as {
          add?: boolean;
          incoming?: boolean;
          outgoingMasked?: boolean;
        } | null;
        if (!guildState?.add || !guildState.incoming || !guildState.outgoingMasked) {
          throw new Error(
            "Guild invitation controls and privacy-safe invite states were not rendered.",
          );
        }
        await evaluate(
          `[...document.querySelectorAll('button')].find((item) => item.textContent.trim() === 'ENTER CODE')?.click()`,
        );
        await waitUntil(
          `Boolean(document.querySelector('input[autocomplete="one-time-code"]'))`,
        );
        await assertLayout(`Guild OTP at ${width}px`);
      }
    }
    await client.send(
      "Network.setCookie",
      {
        name: SESSION_COOKIE_NAME,
        value: setupSession.token,
        url: baseUrl,
        httpOnly: true,
        sameSite: "Lax",
      },
      browserSession,
    );
    await navigate("/setup", "SYSTEM CONFIGURATION");
    await assertLayout(`/setup at ${width}x${height}`);
    if (verifyInstallSystem && installMobileSimulation && !androidSimulation) {
      await waitUntil(`Boolean(document.querySelector('.install-system-prompt'))`);
      await evaluate(`document.querySelector('input')?.focus()`);
      await waitUntil(`!document.querySelector('.install-system-prompt')`);
      await evaluate(`document.querySelector('input')?.blur()`);
      await waitUntil(`Boolean(document.querySelector('.install-system-prompt'))`);
    }
    await client.send(
      "Network.deleteCookies",
      { name: SESSION_COOKIE_NAME, url: baseUrl },
      browserSession,
    );
    for (const [route, expected] of publicRoutes) {
      await navigate(route, expected);
      await assertLayout(`${route} at ${width}px`);
      if (
        verifyInstallSystem &&
        route === "/login" &&
        installMobileSimulation &&
        !androidSimulation
      ) {
        await waitUntil(`Boolean(document.querySelector('.install-system-prompt'))`);
        await evaluate(`document.querySelector('input')?.focus()`);
        await waitUntil(`!document.querySelector('.install-system-prompt')`);
        await evaluate(`document.querySelector('input')?.blur()`);
        await waitUntil(`Boolean(document.querySelector('.install-system-prompt'))`);
      }
      if (
        verifyInstallSystem &&
        route === "/install" &&
        (await evaluate(`Boolean(document.querySelector('.install-system-prompt'))`))
      ) {
        throw new Error("Install prompt must not duplicate the full install guide.");
      }
    }
    if (verifyInstallSystem && width === 390) {
      const injected = await client.send(
        "Page.addScriptToEvaluateOnNewDocument",
        {
          source:
            "Object.defineProperty(navigator, 'standalone', { configurable: true, get: () => true });",
        },
        browserSession,
      );
      await navigate("/login", "SYSTEM ACCESS");
      if (await evaluate(`Boolean(document.querySelector('.install-system-prompt'))`)) {
        throw new Error("Standalone simulation displayed the install prompt.");
      }
      if (typeof injected.identifier === "string") {
        await client.send(
          "Page.removeScriptToEvaluateOnNewDocument",
          { identifier: injected.identifier },
          browserSession,
        );
      }
    }
    await client.send(
      "Network.setCookie",
      {
        name: SESSION_COOKIE_NAME,
        value: session.token,
        url: baseUrl,
        httpOnly: true,
        sameSite: "Lax",
      },
      browserSession,
    );
    console.log(
      JSON.stringify({
        viewport: width,
        avatarAndBranding: "PASS",
        guild: "PASS",
        ...(verifyInstallSystem ? { installSystem: "PASS", height } : {}),
        horizontalOverflow: false,
      }),
    );
  }
} finally {
  client?.close();
  chrome?.kill();
  if (chrome && chrome.exitCode === null) {
    await Promise.race([
      once(chrome, "exit"),
      new Promise((resolve) => setTimeout(resolve, 2_000)),
    ]);
  }
  if (profileDirectory) {
    await rm(profileDirectory, { recursive: true, force: true, maxRetries: 5 });
  }
  if (createdUserIds.length) {
    await Promise.all([
      AuthSessionModel.deleteMany({ userId: { $in: createdUserIds } }),
      GuildInviteModel.deleteMany({
        $or: [
          { inviterUserId: { $in: createdUserIds } },
          { inviteeUserId: { $in: createdUserIds } },
        ],
      }),
      GuildConnectionModel.deleteMany({
        $or: [{ userAId: { $in: createdUserIds } }, { userBId: { $in: createdUserIds } }],
      }),
      GuildSharingPreferencesModel.deleteMany({ userId: { $in: createdUserIds } }),
      UserProfileModel.deleteMany({ userId: { $in: createdUserIds } }),
      WeeklyReportModel.deleteMany({ userId: { $in: createdUserIds } }),
      WinterArcConfigModel.deleteMany({ userId: { $in: createdUserIds } }),
    ]);
    await OwnerModel.deleteMany({ _id: { $in: createdUserIds } });
  }
  if ((await OwnerModel.countDocuments({})) !== ownerCountBefore) {
    process.exitCode = 1;
    console.error("V2.4 responsive fixture cleanup failed.");
  }
  await mongoose.disconnect();
}
