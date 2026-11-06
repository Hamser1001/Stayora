import { useTranslation } from 'react-i18next';
import { MoreHorizontal, Pencil, Trash2, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/primitives';
import { BED_STATUS_CLASSES, BED_STATUS_DOT } from '@/lib/constants';
import { useMoney } from '@/hooks/useMoney';
import { cn } from '@/lib/utils';

function BedTile({ bed, room, onSelect }) {
  const { t } = useTranslation();
  return (
    <Tooltip delayDuration={120}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => onSelect({ bed, room })}
          className={cn(
            'group relative flex h-[46px] flex-col items-center justify-center gap-0.5 rounded-md border text-[10.5px] font-semibold transition-all hover:-translate-y-0.5 hover:shadow-sm',
            BED_STATUS_CLASSES[bed.status],
          )}
        >
          <span className="leading-none">{bed.label.split('-')[1]}</span>
          <span className={cn('size-1 rounded-full opacity-70', BED_STATUS_DOT[bed.status])} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">
        {t('rooms.bedLabel', { number: bed.number })} · {t(`status.${bed.status}`)}
        {bed.guestName ? ` · ${bed.guestName}` : ''}
      </TooltipContent>
    </Tooltip>
  );
}

export function RoomCard({ room, onEdit, onDelete, onSelectBed, highlighted }) {
  const { t } = useTranslation();
  const money = useMoney();
  const occupancy = room.totalBeds ? Math.round((room.occupiedBeds / room.totalBeds) * 100) : 0;

  return (
    <Card
      className={cn(
        'group flex flex-col overflow-hidden transition-all duration-200 hover:border-border hover:shadow-lift',
        highlighted && 'ring-2 ring-primary/25',
      )}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary-soft font-display text-[15px] font-bold text-primary numeric">
              {room.number}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="truncate text-[13.5px] font-semibold">{t(`rooms.type.${room.type}`)}</span>
                {room.audience !== 'mixed' ? (
                  <Badge variant="neutral" className="px-1.5 py-0 text-[9.5px]">
                    {t(`rooms.audience.${room.audience}`)}
                  </Badge>
                ) : null}
              </div>
              <p className="mt-1 flex items-center gap-1 text-[10.5px] text-muted-foreground">
                <span>{t('rooms.floorValue', { floor: room.floor })}</span>
                <span className="text-border">·</span>
                <Users className="size-2.5" />
                {t('units.bed', { count: room.totalBeds })}
              </p>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="shrink-0 text-muted-foreground">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onEdit(room)}>
                <Pencil />
                {t('rooms.editRoom')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onSelect={() => onDelete(room)}>
                <Trash2 />
                {t('common.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="mt-3.5 grid grid-cols-4 gap-1.5">
          {room.beds.map((bed) => (
            <BedTile key={bed.id} bed={bed} room={room} onSelect={onSelectBed} />
          ))}
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border/60 px-4 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${occupancy}%` }}
            />
          </div>
          <span className="truncate text-[10.5px] text-muted-foreground">
            {room.availableBeds}/{room.totalBeds} {t('status.available').toLowerCase()}
          </span>
        </div>
        <p className="shrink-0 text-[11.5px] font-semibold numeric">
          {money.currency(room.pricePerBed)}
          <span className="ml-0.5 font-normal text-muted-foreground">/{t('units.night', { count: 1 })}</span>
        </p>
      </div>
    </Card>
  );
}
