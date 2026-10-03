import { TransactionModal } from './AddExpenseModal.jsx';

/** Add Money = income transaction modal (SPEC §5). */
export default function AddMoneyModal(props) {
  return <TransactionModal {...props} initialType="income" title="Add Money" />;
}
