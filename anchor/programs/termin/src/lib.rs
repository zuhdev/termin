use anchor_lang::prelude::*;
use anchor_spl::token::{self, Approve, Mint, Revoke, Token, TokenAccount, TransferChecked};

declare_id!("GhEAovtiaJj48DwEwXWfDEqkxrPhbLfbryTHNifQEhZ1");

pub const MAX_FEE_CAP_BPS: u16 = 10_000;
pub const SECONDS_PER_DAY: i64 = 86_400;
pub const BPS_DENOMINATOR: u128 = 10_000;

#[program]
pub mod termin {
    use super::*;

    pub fn create_invoice(
        ctx: Context<CreateInvoice>,
        invoice_id: u64,
        amount: u64,
        due_ts: i64,
        fee_bps_per_day: u16,
        fee_cap_bps: u16,
        reference: [u8; 32],
    ) -> Result<()> {
        require!(amount > 0, TermError::InvalidAmount);
        require!(fee_cap_bps <= MAX_FEE_CAP_BPS, TermError::InvalidFeeConfig);
        require!(due_ts > 0, TermError::InvalidDueDate);

        let invoice = &mut ctx.accounts.invoice;
        invoice.invoice_id = invoice_id;
        invoice.issuer = ctx.accounts.issuer.key();
        invoice.payer = ctx.accounts.payer.key();
        invoice.mint = ctx.accounts.mint.key();
        invoice.payer_token_account = Pubkey::default();
        invoice.lp = Pubkey::default();
        invoice.reference = reference;
        invoice.amount = amount;
        invoice.due_ts = due_ts;
        invoice.fee_bps_per_day = fee_bps_per_day;
        invoice.fee_cap_bps = fee_cap_bps;
        invoice.created_ts = Clock::get()?.unix_timestamp;
        invoice.authorized_ts = 0;
        invoice.overdue_ts = 0;
        invoice.collected_ts = 0;
        invoice.advance_in = 0;
        invoice.advance_payout = 0;
        invoice.fee_paid = 0;
        invoice.status = InvoiceStatus::Created;
        invoice.bump = ctx.bumps.invoice;

        emit!(InvoiceCreated {
            invoice: invoice.key(),
            invoice_id,
            issuer: invoice.issuer,
            payer: invoice.payer,
            mint: invoice.mint,
            amount,
            due_ts,
            fee_bps_per_day,
            fee_cap_bps,
        });
        Ok(())
    }

    pub fn authorize_invoice(ctx: Context<AuthorizeInvoice>) -> Result<()> {
        let invoice = &mut ctx.accounts.invoice;
        require!(
            matches!(
                invoice.status,
                InvoiceStatus::Created | InvoiceStatus::Revoked
            ),
            TermError::InvalidStatus
        );

        let delegate_allowance = invoice
            .amount
            .checked_add(invoice.fee_max()?)
            .ok_or(TermError::MathOverflow)?;

        token::approve(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                Approve {
                    to: ctx.accounts.payer_token_account.to_account_info(),
                    delegate: ctx.accounts.vault_authority.to_account_info(),
                    authority: ctx.accounts.payer.to_account_info(),
                },
            ),
            delegate_allowance,
        )?;

        let now = Clock::get()?.unix_timestamp;
        invoice.payer_token_account = ctx.accounts.payer_token_account.key();
        invoice.authorized_ts = now;
        invoice.status = InvoiceStatus::Authorized;

        emit!(InvoiceAuthorized {
            invoice: invoice.key(),
            payer: ctx.accounts.payer.key(),
            payer_token_account: invoice.payer_token_account,
            delegate: ctx.accounts.vault_authority.key(),
            delegate_allowance,
            authorized_ts: now,
        });
        Ok(())
    }

    pub fn advance_invoice(
        ctx: Context<AdvanceInvoice>,
        amount_in: u64,
        payout: u64,
    ) -> Result<()> {
        require!(amount_in > 0, TermError::InvalidAmount);
        require!(
            matches!(
                ctx.accounts.invoice.status,
                InvoiceStatus::Authorized | InvoiceStatus::Overdue
            ),
            TermError::InvalidStatus
        );

        let invoice = &mut ctx.accounts.invoice;
        require!(invoice.advance_payout == 0, TermError::AdvanceAlreadyExists);
        require!(
            payout > 0 && payout <= invoice.amount,
            TermError::InvalidAdvance
        );

        token::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                TransferChecked {
                    from: ctx.accounts.lp_token_account.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.issuer_token_account.to_account_info(),
                    authority: ctx.accounts.lp.to_account_info(),
                },
            ),
            amount_in,
            ctx.accounts.mint.decimals,
        )?;

        invoice.lp = ctx.accounts.lp.key();
        invoice.advance_in = amount_in;
        invoice.advance_payout = payout;

        emit!(InvoiceAdvanced {
            invoice: invoice.key(),
            lp: ctx.accounts.lp.key(),
            amount_in,
            payout,
        });
        Ok(())
    }

    pub fn flag_overdue(ctx: Context<FlagOverdue>) -> Result<()> {
        let invoice = &mut ctx.accounts.invoice;
        let now = Clock::get()?.unix_timestamp;

        require!(
            matches!(
                invoice.status,
                InvoiceStatus::Authorized | InvoiceStatus::Overdue
            ),
            TermError::InvalidStatus
        );
        require!(now >= invoice.due_ts, TermError::NotYetDue);

        invoice.status = InvoiceStatus::Overdue;
        invoice.overdue_ts = now;

        emit!(InvoiceOverdueFlagged {
            invoice: invoice.key(),
            due_ts: invoice.due_ts,
            flagged_ts: now,
        });
        Ok(())
    }

    pub fn collect_invoice(ctx: Context<CollectInvoice>) -> Result<()> {
        let invoice = &mut ctx.accounts.invoice;
        let now = Clock::get()?.unix_timestamp;

        require!(
            matches!(
                invoice.status,
                InvoiceStatus::Authorized | InvoiceStatus::Overdue
            ),
            TermError::InvalidStatus
        );
        require!(now >= invoice.due_ts, TermError::NotYetDue);

        let fee = invoice.late_fee(now)?;
        let total = invoice
            .amount
            .checked_add(fee)
            .ok_or(TermError::MathOverflow)?;

        let invoice_key = invoice.key();
        let bump = [ctx.bumps.vault_authority];
        let seeds: &[&[u8]] = &[b"vault_auth", invoice_key.as_ref(), &bump];
        let signer_seeds: &[&[&[u8]]] = &[&seeds[..]];

        if invoice.advance_payout > 0 {
            require!(
                ctx.accounts.lp_token_account.mint == invoice.mint
                    && ctx.accounts.lp_token_account.owner == invoice.lp,
                TermError::InvalidTokenAccount
            );

            let payout = invoice.advance_payout;
            token::transfer_checked(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.key(),
                    TransferChecked {
                        from: ctx.accounts.payer_token_account.to_account_info(),
                        mint: ctx.accounts.mint.to_account_info(),
                        to: ctx.accounts.lp_token_account.to_account_info(),
                        authority: ctx.accounts.vault_authority.to_account_info(),
                    },
                    signer_seeds,
                ),
                payout,
                ctx.accounts.mint.decimals,
            )?;

            let issuer_cut = total.checked_sub(payout).ok_or(TermError::MathOverflow)?;
            if issuer_cut > 0 {
                token::transfer_checked(
                    CpiContext::new_with_signer(
                        ctx.accounts.token_program.key(),
                        TransferChecked {
                            from: ctx.accounts.payer_token_account.to_account_info(),
                            mint: ctx.accounts.mint.to_account_info(),
                            to: ctx.accounts.issuer_token_account.to_account_info(),
                            authority: ctx.accounts.vault_authority.to_account_info(),
                        },
                        signer_seeds,
                    ),
                    issuer_cut,
                    ctx.accounts.mint.decimals,
                )?;
            }
        } else {
            token::transfer_checked(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.key(),
                    TransferChecked {
                        from: ctx.accounts.payer_token_account.to_account_info(),
                        mint: ctx.accounts.mint.to_account_info(),
                        to: ctx.accounts.issuer_token_account.to_account_info(),
                        authority: ctx.accounts.vault_authority.to_account_info(),
                    },
                    signer_seeds,
                ),
                total,
                ctx.accounts.mint.decimals,
            )?;
        }

        invoice.status = InvoiceStatus::Collected;
        invoice.fee_paid = fee;
        invoice.collected_ts = now;

        emit!(InvoiceCollected {
            invoice: invoice_key,
            amount: invoice.amount,
            fee,
            total,
            collected_ts: now,
        });
        Ok(())
    }

    pub fn revoke_invoice(ctx: Context<RevokeInvoice>) -> Result<()> {
        let invoice = &mut ctx.accounts.invoice;
        let now = Clock::get()?.unix_timestamp;

        require!(
            matches!(
                invoice.status,
                InvoiceStatus::Authorized | InvoiceStatus::Overdue
            ),
            TermError::InvalidStatus
        );
        require!(now < invoice.due_ts, TermError::RevokeWindowClosed);
        require!(invoice.advance_payout == 0, TermError::AdvanceOutstanding);

        token::revoke(CpiContext::new(
            ctx.accounts.token_program.key(),
            Revoke {
                source: ctx.accounts.payer_token_account.to_account_info(),
                authority: ctx.accounts.payer.to_account_info(),
            },
        ))?;

        invoice.status = InvoiceStatus::Revoked;

        emit!(InvoiceRevoked {
            invoice: invoice.key(),
            payer: ctx.accounts.payer.key(),
        });
        Ok(())
    }

    pub fn cancel_invoice(ctx: Context<CancelInvoice>) -> Result<()> {
        let invoice = &mut ctx.accounts.invoice;
        require!(
            invoice.status == InvoiceStatus::Created,
            TermError::InvalidStatus
        );

        invoice.status = InvoiceStatus::Cancelled;

        emit!(InvoiceCancelled {
            invoice: invoice.key(),
            issuer: ctx.accounts.issuer.key(),
        });
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(invoice_id: u64)]
pub struct CreateInvoice<'info> {
    #[account(mut)]
    pub issuer: Signer<'info>,

    /// CHECK: payer identity is recorded only; their signature is required later at authorize_invoice
    pub payer: UncheckedAccount<'info>,

    pub mint: Account<'info, Mint>,

    #[account(
        init,
        payer = issuer,
        space = 8 + Invoice::INIT_SPACE,
        seeds = [b"invoice", issuer.key().as_ref(), invoice_id.to_le_bytes().as_ref()],
        bump
    )]
    pub invoice: Account<'info, Invoice>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AuthorizeInvoice<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    pub mint: Account<'info, Mint>,

    #[account(mut, has_one = payer, has_one = mint)]
    pub invoice: Account<'info, Invoice>,

    #[account(mut, token::mint = mint, token::authority = payer)]
    pub payer_token_account: Account<'info, TokenAccount>,

    /// CHECK: delegate PDA derived from the invoice; used only as an SPL delegate target
    #[account(seeds = [b"vault_auth", invoice.key().as_ref()], bump)]
    pub vault_authority: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct AdvanceInvoice<'info> {
    #[account(mut)]
    pub lp: Signer<'info>,

    pub mint: Account<'info, Mint>,

    #[account(mut, has_one = mint)]
    pub invoice: Account<'info, Invoice>,

    #[account(mut, token::mint = mint, token::authority = lp)]
    pub lp_token_account: Account<'info, TokenAccount>,

    #[account(mut, token::mint = mint, token::authority = invoice.issuer)]
    pub issuer_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct FlagOverdue<'info> {
    #[account(mut)]
    pub invoice: Account<'info, Invoice>,
}

#[derive(Accounts)]
pub struct CollectInvoice<'info> {
    pub mint: Account<'info, Mint>,

    #[account(mut, has_one = mint)]
    pub invoice: Account<'info, Invoice>,

    #[account(
        mut,
        address = invoice.payer_token_account,
        token::mint = mint,
        token::authority = invoice.payer,
    )]
    pub payer_token_account: Account<'info, TokenAccount>,

    #[account(mut, token::mint = mint, token::authority = invoice.issuer)]
    pub issuer_token_account: Account<'info, TokenAccount>,

    #[account(mut, dup, token::mint = mint)]
    pub lp_token_account: Account<'info, TokenAccount>,

    /// CHECK: delegate PDA derived from the invoice; used only as an SPL delegate authority
    #[account(seeds = [b"vault_auth", invoice.key().as_ref()], bump)]
    pub vault_authority: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct RevokeInvoice<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut, has_one = payer)]
    pub invoice: Account<'info, Invoice>,

    #[account(
        mut,
        address = invoice.payer_token_account,
        token::authority = payer,
    )]
    pub payer_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CancelInvoice<'info> {
    #[account(mut)]
    pub issuer: Signer<'info>,

    #[account(mut, has_one = issuer)]
    pub invoice: Account<'info, Invoice>,
}

#[account]
#[derive(InitSpace)]
pub struct Invoice {
    pub invoice_id: u64,
    pub issuer: Pubkey,
    pub payer: Pubkey,
    pub mint: Pubkey,
    pub payer_token_account: Pubkey,
    pub lp: Pubkey,
    pub reference: [u8; 32],
    pub amount: u64,
    pub due_ts: i64,
    pub created_ts: i64,
    pub authorized_ts: i64,
    pub overdue_ts: i64,
    pub collected_ts: i64,
    pub advance_in: u64,
    pub advance_payout: u64,
    pub fee_paid: u64,
    pub fee_bps_per_day: u16,
    pub fee_cap_bps: u16,
    pub status: InvoiceStatus,
    pub bump: u8,
    pub _reserved: [u8; 16],
}

impl Invoice {
    pub fn fee_max(&self) -> Result<u64> {
        Ok(((self.amount as u128) * (self.fee_cap_bps as u128) / BPS_DENOMINATOR) as u64)
    }

    pub fn late_fee(&self, now: i64) -> Result<u64> {
        if now <= self.due_ts {
            return Ok(0);
        }
        let days = ((now - self.due_ts) as u128) / (SECONDS_PER_DAY as u128);
        let raw =
            (self.amount as u128) * (self.fee_bps_per_day as u128) * days / BPS_DENOMINATOR;
        let cap = (self.amount as u128) * (self.fee_cap_bps as u128) / BPS_DENOMINATOR;
        Ok(raw.min(cap) as u64)
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum InvoiceStatus {
    Created,
    Authorized,
    Overdue,
    Collected,
    Cancelled,
    Revoked,
}

#[event]
pub struct InvoiceCreated {
    pub invoice: Pubkey,
    pub invoice_id: u64,
    pub issuer: Pubkey,
    pub payer: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub due_ts: i64,
    pub fee_bps_per_day: u16,
    pub fee_cap_bps: u16,
}

#[event]
pub struct InvoiceAuthorized {
    pub invoice: Pubkey,
    pub payer: Pubkey,
    pub payer_token_account: Pubkey,
    pub delegate: Pubkey,
    pub delegate_allowance: u64,
    pub authorized_ts: i64,
}

#[event]
pub struct InvoiceAdvanced {
    pub invoice: Pubkey,
    pub lp: Pubkey,
    pub amount_in: u64,
    pub payout: u64,
}

#[event]
pub struct InvoiceOverdueFlagged {
    pub invoice: Pubkey,
    pub due_ts: i64,
    pub flagged_ts: i64,
}

#[event]
pub struct InvoiceCollected {
    pub invoice: Pubkey,
    pub amount: u64,
    pub fee: u64,
    pub total: u64,
    pub collected_ts: i64,
}

#[event]
pub struct InvoiceCancelled {
    pub invoice: Pubkey,
    pub issuer: Pubkey,
}

#[event]
pub struct InvoiceRevoked {
    pub invoice: Pubkey,
    pub payer: Pubkey,
}

#[error_code]
pub enum TermError {
    #[msg("Invalid invoice amount")]
    InvalidAmount,
    #[msg("Fee cap must not exceed 100% of face value")]
    InvalidFeeConfig,
    #[msg("Invalid due date")]
    InvalidDueDate,
    #[msg("Invoice status does not allow this action")]
    InvalidStatus,
    #[msg("Invoice is not due yet")]
    NotYetDue,
    #[msg("Invoice can only be revoked before its due date")]
    RevokeWindowClosed,
    #[msg("Invoice has an outstanding advance and cannot be revoked")]
    AdvanceOutstanding,
    #[msg("An advance already exists for this invoice")]
    AdvanceAlreadyExists,
    #[msg("Invalid advance terms")]
    InvalidAdvance,
    #[msg("Token accounts must match the invoice mint and owners")]
    InvalidTokenAccount,
    #[msg("Math overflow")]
    MathOverflow,
}

#[cfg(test)]
mod tests;
