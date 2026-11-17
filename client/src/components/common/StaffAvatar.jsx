import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/primitives';
import { avatarSrc } from '@/lib/avatar';
import { initials } from '@/lib/utils';

/** Staff avatar with the account's uploaded photo and an initials fallback. */
export function StaffAvatar({ member, className = 'size-9', fallbackClassName, imageClassName }) {
  const name = member?.name || '';
  return (
    <Avatar className={className}>
      {member?.avatarUrl ? (
        <AvatarImage
          src={avatarSrc(member.avatarUrl)}
          alt={name}
          className={imageClassName || 'object-cover'}
        />
      ) : null}
      <AvatarFallback className={fallbackClassName}>
        {member?.initials || initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
