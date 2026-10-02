import Image from "next/image";
import { getAvatar } from "@/lib/avatar-catalogue";
export function Avatar({
  avatarKey,
  size = 64,
  decorative = false,
  eager = false,
  className = "",
}: {
  readonly avatarKey?: string | null;
  readonly size?: number;
  readonly decorative?: boolean;
  readonly eager?: boolean;
  readonly className?: string;
}) {
  const avatar = getAvatar(avatarKey);
  return (
    <Image
      className={`identity-avatar ${className}`}
      src={avatar.imagePath}
      alt={decorative ? "" : `${avatar.name} avatar`}
      width={size}
      height={size}
      sizes={`${size}px`}
      loading={eager ? "eager" : "lazy"}
    />
  );
}
