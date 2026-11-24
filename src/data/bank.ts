// The fictional bank. Every level reads its names from here, so renaming it is one edit.
// TODO(musa): pick the final names and check no real bank or product uses them.
export const bank = {
  name: 'Fernleigh Bank',
  assistant: 'Penny',
  securityLead: 'Dana Okafor',
} as const;

// Level 5's two test customers. The player is signed in as the first; the second is the account they must reach.
// TODO(musa): placeholder names, kept from the level 5 proposal. Swap them here if you want your own.
export const customers = {
  player: { name: 'Sam Okoye', id: 'A-1001' },
  other: { name: 'Dana Whitlock', id: 'A-2002' },
} as const;
