import Card, { CardBody } from '../ui/Card.jsx';
import { formatMoney } from '../../lib/format.js';

export default function BalanceCard({ data, currency }) {
  const available = Number((data && data.availableBalance) || 0);
  const toReceive = Number((data && data.moneyToReceive) || 0);
  const toPay = Number((data && data.moneyToPay) || 0);
  const net = Number((data && data.netPosition) || available);

  return (
    <Card className="overflow-hidden">
      <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 px-5 pb-5 pt-5 text-white">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-100/90">
          Available Balance
        </p>
        <p className="money mt-1 text-3xl font-bold">
          {formatMoney(available, currency)}
        </p>
        <p className="mt-1 text-xs text-emerald-100/90">
          Net position:{' '}
          <span className="money font-semibold text-white">{formatMoney(net, currency)}</span>
        </p>
      </div>
      <CardBody className="grid grid-cols-2 gap-3 pt-4">
        <div className="rounded-xl bg-emerald-50 px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
            💳 To Receive
          </p>
          <p className="money mt-0.5 text-lg font-bold text-emerald-700">
            {formatMoney(toReceive, currency)}
          </p>
        </div>
        <div className="rounded-xl bg-rose-50 px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-600">
            📤 To Pay
          </p>
          <p className="money mt-0.5 text-lg font-bold text-rose-600">
            {formatMoney(toPay, currency)}
          </p>
        </div>
      </CardBody>
    </Card>
  );
}

export function BalanceCardSkeleton() {
  return <Card className="h-44 animate-pulse bg-slate-100" />;
}
