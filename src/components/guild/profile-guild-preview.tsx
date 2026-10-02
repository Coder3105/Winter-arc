import Link from "next/link";

import { Avatar } from "@/components/profile/avatar";
import type { getGuildMemberListProjection } from "@/server/services/guild-projection-service";

type GuildMembers = Awaited<ReturnType<typeof getGuildMemberListProjection>>;

export function ProfileGuildPreview({ members }: { readonly members: GuildMembers }) {
  return (
    <div className="profile-guild-preview">
      {members.length ? (
        <div className="guild-member-list">
          {members.slice(0, 4).map((member) => (
            <article key={member.userId} className="guild-member-card">
              <Avatar avatarKey={member.avatarKey} size={48} />
              <div>
                <strong>{member.displayName}</strong>
                <span>{member.selectedTitle ?? "SYSTEM HUNTER"}</span>
                <small>
                  {member.progression
                    ? `RANK ${member.progression.rank} // LEVEL ${member.progression.level}`
                    : "PROGRESSION PRIVATE"}
                </small>
              </div>
              <Link className="secondary-button" href={`/guild/${member.userId}`}>
                VIEW
              </Link>
            </article>
          ))}
        </div>
      ) : (
        <div className="guild-empty-state">
          <strong>NO MEMBERS CONNECTED</strong>
          <p>Approved Guild members will appear here.</p>
        </div>
      )}
      {members.length > 4 ? (
        <p className="profile-guild-preview__more">
          +{members.length - 4} MORE APPROVED MEMBER
          {members.length - 4 === 1 ? "" : "S"}
        </p>
      ) : null}
    </div>
  );
}
