// ==========================================
// FILE: frontend/src/components/FollowButton.tsx
// PURPOSE: Follow or unfollow an organiser.
// ==========================================
import { UserCheck, UserPlus } from "lucide-react";
import { useFollow } from "../lib/engagement";
import Button from "./ui/Button";

export default function FollowButton({ sellerId, name }: { sellerId: string; name: string }) {
  const { saved, toggle, pending } = useFollow(sellerId);

  return (
    <Button
      size="sm"
      variant={saved ? "secondary" : "primary"}
      loading={pending}
      aria-pressed={saved}
      aria-label={saved ? `Unfollow ${name}` : `Follow ${name}`}
      icon={saved ? <UserCheck className="size-4" aria-hidden="true" /> : <UserPlus className="size-4" aria-hidden="true" />}
      onClick={toggle}
    >
      {saved ? "Following" : "Follow"}
    </Button>
  );
}
// ==========================================
// END OF FILE: frontend/src/components/FollowButton.tsx
// ==========================================