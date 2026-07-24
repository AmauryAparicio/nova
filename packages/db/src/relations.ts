import { defineRelations } from "drizzle-orm";

import { account, apikey, session, user, verification } from "./schema/auth";
import {
  expense,
  expenseCategory,
  expenseCategoryRelation,
  expenseInstallment,
  reimbursement,
} from "./schema/expenses";
import { financialAccount } from "./schema/financial-accounts";
import { income, incomeCategory } from "./schema/income";
import { todo } from "./schema/todo";
import { transfer } from "./schema/transfers";

const schema = {
  account,
  apikey,
  expense,
  expenseCategory,
  expenseCategoryRelation,
  expenseInstallment,
  financialAccount,
  income,
  incomeCategory,
  reimbursement,
  session,
  todo,
  transfer,
  user,
  verification,
};

export const relations = defineRelations(schema, (r) => ({
  account: {
    user: r.one.user({
      from: r.account.userId,
      to: r.user.id,
    }),
  },
  apikey: {
    user: r.one.user({
      from: r.apikey.userId,
      to: r.user.id,
    }),
  },
  expense: {
    account: r.one.financialAccount({
      from: r.expense.accountId,
      to: r.financialAccount.id,
    }),
    categories: r.many.expenseCategoryRelation(),
    installments: r.many.expenseInstallment(),
    reimbursements: r.many.reimbursement(),
    user: r.one.user({
      from: r.expense.userId,
      to: r.user.id,
    }),
  },
  expenseCategory: {
    expenses: r.many.expenseCategoryRelation(),
    user: r.one.user({
      from: r.expenseCategory.userId,
      to: r.user.id,
    }),
  },
  expenseCategoryRelation: {
    category: r.one.expenseCategory({
      from: r.expenseCategoryRelation.categoryId,
      to: r.expenseCategory.id,
    }),
    expense: r.one.expense({
      from: r.expenseCategoryRelation.expenseId,
      to: r.expense.id,
    }),
  },
  expenseInstallment: {
    expense: r.one.expense({
      from: r.expenseInstallment.expenseId,
      to: r.expense.id,
    }),
    user: r.one.user({
      from: r.expenseInstallment.userId,
      to: r.user.id,
    }),
  },
  financialAccount: {
    expenses: r.many.expense(),
    income: r.many.income(),
    reimbursements: r.many.reimbursement(),
    transfersFrom: r.many.transfer({
      alias: "transferFromAccount",
    }),
    transfersTo: r.many.transfer({
      alias: "transferToAccount",
    }),
    user: r.one.user({
      from: r.financialAccount.userId,
      to: r.user.id,
    }),
  },
  income: {
    account: r.one.financialAccount({
      from: r.income.accountId,
      to: r.financialAccount.id,
    }),
    incomeCategory: r.one.incomeCategory({
      from: r.income.categoryId,
      to: r.incomeCategory.id,
    }),
    user: r.one.user({
      from: r.income.userId,
      to: r.user.id,
    }),
  },
  incomeCategory: {
    incomes: r.many.income(),
    user: r.one.user({
      from: r.incomeCategory.userId,
      to: r.user.id,
    }),
  },
  reimbursement: {
    account: r.one.financialAccount({
      from: r.reimbursement.accountId,
      to: r.financialAccount.id,
    }),
    expense: r.one.expense({
      from: r.reimbursement.expenseId,
      to: r.expense.id,
    }),
    user: r.one.user({
      from: r.reimbursement.userId,
      to: r.user.id,
    }),
  },
  session: {
    user: r.one.user({
      from: r.session.userId,
      to: r.user.id,
    }),
  },
  transfer: {
    fromAccount: r.one.financialAccount({
      alias: "transferFromAccount",
      from: r.transfer.fromAccountId,
      to: r.financialAccount.id,
    }),
    toAccount: r.one.financialAccount({
      alias: "transferToAccount",
      from: r.transfer.toAccountId,
      to: r.financialAccount.id,
    }),
    user: r.one.user({
      from: r.transfer.userId,
      to: r.user.id,
    }),
  },
  user: {
    accounts: r.many.account(),
    apikeys: r.many.apikey(),
    expenseCategories: r.many.expenseCategory(),
    expenseInstallments: r.many.expenseInstallment(),
    expenses: r.many.expense(),
    financialAccounts: r.many.financialAccount(),
    income: r.many.income(),
    incomeCategories: r.many.incomeCategory(),
    reimbursements: r.many.reimbursement(),
    sessions: r.many.session(),
    transfers: r.many.transfer(),
  },
}));
