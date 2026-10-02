import { AuthenticatedHeader } from "@/components/layout/authenticated-header";
import Link from "next/link";
import { BaselineSummary } from "@/components/profile/baseline-summary";
import { CalculatedMetrics } from "@/components/profile/calculated-metrics";
import { ProgressionIdentity } from "@/components/progression/progression-status";
import { SystemPanel } from "@/components/system/system-panel";
import { ShadowGuard } from "@/components/system/shadow-portrait";
import { Avatar } from "@/components/profile/avatar";
import { ProfileGuildPreview } from "@/components/guild/profile-guild-preview";
import { requirePageOwner } from "@/server/auth/request-auth";
import { getCalculationContext } from "@/server/services/calculation-summary-service";
import { getProgressionSummary } from "@/server/services/progression-service";
import { getGuildMemberListProjection } from "@/server/services/guild-projection-service";

export default async function ProfilePage() {
  const owner = await requirePageOwner();
  const [{ profile, config, baseline, summary }, progression, guildMembers] =
    await Promise.all([
      getCalculationContext(owner.id),
      getProgressionSummary(owner.id),
      getGuildMemberListProjection(owner.id),
    ]);

  return (
    <main className="app-shell">
      <div className="app-frame app-frame--wide">
        <AuthenticatedHeader
          displayName={owner.displayName}
          section="OWNER PROFILE"
          active="PROFILE"
        />
        <div className="page-heading">
          <p>IDENTITY // CONFIGURATION // SOURCE DATA</p>
          <h1>OWNER PROFILE</h1>
        </div>
        <div className="profile-grid">
          <div className="profile-grid__wide">
            <ShadowGuard name={owner.displayName} />
          </div>
          <SystemPanel eyebrow="AUTH // OWNER" title="OWNER">
            <div className="system-identity">
              <Avatar avatarKey={profile?.avatarKey ?? null} size={96} eager />
              <div>
                <p>SYSTEM IDENTITY</p>
                <strong>{owner.displayName}</strong>
                <Link
                  className="system-status-action identity-change-link"
                  href="/profile/avatar"
                >
                  CHANGE AVATAR
                </Link>
              </div>
            </div>
            <dl className="detail-list">
              <div>
                <dt>DISPLAY NAME</dt>
                <dd>{owner.displayName}</dd>
              </div>
              <div>
                <dt>EMAIL</dt>
                <dd>{owner.email}</dd>
              </div>
              <div>
                <dt>STATUS</dt>
                <dd>ACTIVE</dd>
              </div>
            </dl>
          </SystemPanel>
          <SystemPanel eyebrow="MEASURED // IDENTITY" title="PROFILE">
            {profile ? (
              <dl className="detail-list">
                <div>
                  <dt>HEIGHT</dt>
                  <dd>
                    {profile.heightCm === null
                      ? "NOT AVAILABLE"
                      : `${profile.heightCm} cm`}
                  </dd>
                </div>
                <div>
                  <dt>AGE AT BASELINE</dt>
                  <dd>{profile.ageAtBaseline ?? "NOT AVAILABLE"}</dd>
                </div>
                <div>
                  <dt>SEX</dt>
                  <dd>{profile.sex ?? "NOT AVAILABLE"}</dd>
                </div>
                <div>
                  <dt>TIMEZONE</dt>
                  <dd>{profile.timezone}</dd>
                </div>
                <div>
                  <dt>UNITS</dt>
                  <dd>
                    {profile.preferredWeightUnit} / {profile.preferredDistanceUnit}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="empty-state">PROFILE SETUP INCOMPLETE</p>
            )}
          </SystemPanel>
          <SystemPanel
            className="profile-grid__wide"
            eyebrow="CONFIG // PROTOCOL"
            title="WINTER ARC"
          >
            {config ? (
              <>
                <dl className="detail-list detail-list--columns">
                  <div>
                    <dt>NAME</dt>
                    <dd>{config.name}</dd>
                  </div>
                  <div>
                    <dt>STATUS</dt>
                    <dd>{config.status}</dd>
                  </div>
                  <div>
                    <dt>DATES</dt>
                    <dd>
                      {config.startDate} — {config.endDate}
                    </dd>
                  </div>
                  <div>
                    <dt>WORKOUTS</dt>
                    <dd>{config.weeklyWorkoutTarget} / 7</dd>
                  </div>
                  <div>
                    <dt>GOAL WEIGHT</dt>
                    <dd>
                      {config.targetWeightKg ? `${config.targetWeightKg} kg` : "NOT SET"}
                    </dd>
                  </div>
                </dl>
                <div className="rule-chip-list">
                  {config.rules.map((rule) => (
                    <span key={rule.key} className={rule.enabled ? "" : "is-disabled"}>
                      {rule.name}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <p className="empty-state">PROTOCOL SETUP INCOMPLETE</p>
            )}
          </SystemPanel>
          <SystemPanel
            className="profile-grid__wide"
            eyebrow="PWA // DEVICE"
            title="INSTALL"
          >
            <p className="empty-state">
              Install Winter Arc for standalone Home Screen access.
            </p>
            <Link className="system-status-action" href="/install">
              OPEN INSTALL GUIDE →
            </Link>
          </SystemPanel>
          <div className="profile-grid__wide">
            <ProgressionIdentity summary={progression} />
          </div>
          <SystemPanel
            className="profile-grid__wide"
            eyebrow="OPT-IN // PRIVATE"
            title="NOTIFICATION PROTOCOL"
          >
            <p className="empty-state">
              Configure in-app reminders, quiet hours, and lock-screen privacy.
            </p>
            <Link className="system-status-action" href="/profile/notifications">
              OPEN NOTIFICATION SETTINGS →
            </Link>
          </SystemPanel>
          <SystemPanel
            className="profile-grid__wide"
            eyebrow="SYSTEM NETWORK // PRIVATE"
            title="GUILD"
          >
            <ProfileGuildPreview members={guildMembers} />
            <Link className="system-status-action" href="/guild">
              OPEN GUILD →
            </Link>
          </SystemPanel>
          <SystemPanel
            className="profile-grid__wide"
            eyebrow="SOURCE // INBODY120"
            title="BASELINE ASSESSMENT"
          >
            <BaselineSummary baseline={baseline} />
          </SystemPanel>
          <SystemPanel
            className="profile-grid__wide"
            eyebrow="DERIVED // READ ONLY"
            title="CALCULATED METRICS"
          >
            <CalculatedMetrics summary={summary} />
          </SystemPanel>
        </div>
      </div>
    </main>
  );
}
