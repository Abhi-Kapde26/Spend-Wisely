import Button from '../ui/Button.jsx';

export default function QuickActions({ onAddExpense, onAddMoney, onBorrowLend }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Button size="lg" variant="primary" onClick={onAddExpense} className="py-3.5 text-sm uppercase tracking-wide">
        + Add Expense
      </Button>
      <Button size="lg" variant="subtle" onClick={onAddMoney} className="py-3.5 text-sm uppercase tracking-wide">
        + Add Money
      </Button>
      <Button
        size="lg"
        variant="dark"
        onClick={onBorrowLend}
        className="py-3.5 text-sm uppercase tracking-wide"
      >
        + Borrow / Lend
      </Button>
    </div>
  );
}
