#[cfg(test)]
mod tests {
    use crate::{Invoice, InvoiceStatus, ID as PROGRAM_ID};
    use anchor_lang::AccountDeserialize;
    use litesvm::LiteSVM;
    use solana_sdk::{
        clock::Clock,
        instruction::{AccountMeta, Instruction},
        pubkey::Pubkey,
        signature::Keypair,
        signer::Signer,
        transaction::Transaction,
    };
    use std::str::FromStr;

    const LAMPORTS_PER_SOL: u64 = 1_000_000_000;
    const TOKEN_ACCOUNT_LEN: usize = 165;
    const MINT_LEN: usize = 82;
    const ONE_TOKEN: u64 = 1_000_000;
    const AMOUNT: u64 = 1_000 * ONE_TOKEN;
    const DAY: i64 = 86_400;
    const T0: i64 = 1_750_000_000;
    const FEE_BPS_PER_DAY: u16 = 50;
    const FEE_CAP_BPS: u16 = 500;
    const BPS: u64 = 10_000;

    fn token_program_id() -> Pubkey {
        Pubkey::from_str("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA").unwrap()
    }

    fn system_create_account_ix(
        payer: &Pubkey,
        account: &Pubkey,
        lamports: u64,
        space: u64,
        owner: &Pubkey,
    ) -> Instruction {
        let mut data = 0u32.to_le_bytes().to_vec();
        data.extend_from_slice(&lamports.to_le_bytes());
        data.extend_from_slice(&space.to_le_bytes());
        data.extend_from_slice(owner.as_ref());
        Instruction {
            program_id: Pubkey::from_str("11111111111111111111111111111111").unwrap(),
            accounts: vec![
                AccountMeta::new(*payer, true),
                AccountMeta::new(*account, true),
            ],
            data,
        }
    }

    fn disc(name: &str) -> [u8; 8] {
        let hash = solana_sdk::hash::hashv(&[format!("global:{name}").as_bytes()]);
        let mut d = [0u8; 8];
        d.copy_from_slice(&hash.to_bytes()[..8]);
        d
    }

    fn invoice_pda(issuer: &Pubkey, invoice_id: u64) -> Pubkey {
        Pubkey::find_program_address(
            &[b"invoice", issuer.as_ref(), &invoice_id.to_le_bytes()],
            &PROGRAM_ID,
        )
        .0
    }

    fn vault_authority_pda(invoice: &Pubkey) -> Pubkey {
        Pubkey::find_program_address(&[b"vault_auth", invoice.as_ref()], &PROGRAM_ID).0
    }

    fn init_mint_ix(mint: &Pubkey, decimals: u8, authority: &Pubkey) -> Instruction {
        let mut data = vec![20u8, decimals];
        data.extend_from_slice(authority.as_ref());
        data.push(0);
        data.extend_from_slice(&[0u8; 32]);
        Instruction {
            program_id: token_program_id(),
            accounts: vec![AccountMeta::new(*mint, false)],
            data,
        }
    }

    fn create_token_account_ixs(
        payer: &Pubkey,
        account: &Pubkey,
        mint: &Pubkey,
        owner: &Pubkey,
        rent: u64,
    ) -> Vec<Instruction> {
        let mut data = vec![18u8];
        data.extend_from_slice(owner.as_ref());
        vec![
            system_create_account_ix(payer, account, rent, TOKEN_ACCOUNT_LEN as u64, &token_program_id()),
            Instruction {
                program_id: token_program_id(),
                accounts: vec![
                    AccountMeta::new(*account, false),
                    AccountMeta::new_readonly(*mint, false),
                ],
                data,
            },
        ]
    }

    fn mint_to_ix(mint: &Pubkey, to: &Pubkey, authority: &Pubkey, amount: u64) -> Instruction {
        let mut data = vec![7u8];
        data.extend_from_slice(&amount.to_le_bytes());
        Instruction {
            program_id: token_program_id(),
            accounts: vec![
                AccountMeta::new(*mint, false),
                AccountMeta::new(*to, false),
                AccountMeta::new_readonly(*authority, true),
            ],
            data,
        }
    }

    fn create_invoice_ix(
        issuer: &Pubkey,
        payer: &Pubkey,
        mint: &Pubkey,
        invoice: &Pubkey,
        invoice_id: u64,
        amount: u64,
        due_ts: i64,
    ) -> Instruction {
        let mut data = disc("create_invoice").to_vec();
        data.extend_from_slice(&invoice_id.to_le_bytes());
        data.extend_from_slice(&amount.to_le_bytes());
        data.extend_from_slice(&due_ts.to_le_bytes());
        data.extend_from_slice(&FEE_BPS_PER_DAY.to_le_bytes());
        data.extend_from_slice(&FEE_CAP_BPS.to_le_bytes());
        data.extend_from_slice(&[9u8; 32]);
        Instruction {
            program_id: PROGRAM_ID,
            accounts: vec![
                AccountMeta::new(*issuer, true),
                AccountMeta::new_readonly(*payer, false),
                AccountMeta::new_readonly(*mint, false),
                AccountMeta::new(*invoice, false),
                AccountMeta::new_readonly(anchor_lang::system_program::ID, false),
            ],
            data,
        }
    }

    fn authorize_invoice_ix(
        payer: &Pubkey,
        mint: &Pubkey,
        invoice: &Pubkey,
        payer_token_account: &Pubkey,
        vault_authority: &Pubkey,
    ) -> Instruction {
        Instruction {
            program_id: PROGRAM_ID,
            accounts: vec![
                AccountMeta::new(*payer, true),
                AccountMeta::new_readonly(*mint, false),
                AccountMeta::new(*invoice, false),
                AccountMeta::new(*payer_token_account, false),
                AccountMeta::new_readonly(*vault_authority, false),
                AccountMeta::new_readonly(token_program_id(), false),
            ],
            data: disc("authorize_invoice").to_vec(),
        }
    }

    fn advance_invoice_ix(
        lp: &Pubkey,
        mint: &Pubkey,
        invoice: &Pubkey,
        lp_token_account: &Pubkey,
        issuer_token_account: &Pubkey,
        amount_in: u64,
        payout: u64,
    ) -> Instruction {
        let mut data = disc("advance_invoice").to_vec();
        data.extend_from_slice(&amount_in.to_le_bytes());
        data.extend_from_slice(&payout.to_le_bytes());
        Instruction {
            program_id: PROGRAM_ID,
            accounts: vec![
                AccountMeta::new(*lp, true),
                AccountMeta::new_readonly(*mint, false),
                AccountMeta::new(*invoice, false),
                AccountMeta::new(*lp_token_account, false),
                AccountMeta::new(*issuer_token_account, false),
                AccountMeta::new_readonly(token_program_id(), false),
            ],
            data,
        }
    }

    fn flag_overdue_ix(invoice: &Pubkey) -> Instruction {
        Instruction {
            program_id: PROGRAM_ID,
            accounts: vec![AccountMeta::new(*invoice, false)],
            data: disc("flag_overdue").to_vec(),
        }
    }

    fn collect_invoice_ix(
        mint: &Pubkey,
        invoice: &Pubkey,
        payer_token_account: &Pubkey,
        issuer_token_account: &Pubkey,
        lp_token_account: &Pubkey,
        vault_authority: &Pubkey,
    ) -> Instruction {
        Instruction {
            program_id: PROGRAM_ID,
            accounts: vec![
                AccountMeta::new_readonly(*mint, false),
                AccountMeta::new(*invoice, false),
                AccountMeta::new(*payer_token_account, false),
                AccountMeta::new(*issuer_token_account, false),
                AccountMeta::new(*lp_token_account, false),
                AccountMeta::new_readonly(*vault_authority, false),
                AccountMeta::new_readonly(token_program_id(), false),
            ],
            data: disc("collect_invoice").to_vec(),
        }
    }

    fn revoke_invoice_ix(
        payer: &Pubkey,
        invoice: &Pubkey,
        payer_token_account: &Pubkey,
    ) -> Instruction {
        Instruction {
            program_id: PROGRAM_ID,
            accounts: vec![
                AccountMeta::new(*payer, true),
                AccountMeta::new(*invoice, false),
                AccountMeta::new(*payer_token_account, false),
                AccountMeta::new_readonly(token_program_id(), false),
            ],
            data: disc("revoke_invoice").to_vec(),
        }
    }

    fn cancel_invoice_ix(issuer: &Pubkey, invoice: &Pubkey) -> Instruction {
        Instruction {
            program_id: PROGRAM_ID,
            accounts: vec![
                AccountMeta::new(*issuer, true),
                AccountMeta::new(*invoice, false),
            ],
            data: disc("cancel_invoice").to_vec(),
        }
    }

    fn send(
        svm: &mut LiteSVM,
        instructions: &[Instruction],
        signers: &[&dyn Signer],
        fee_payer: &Pubkey,
    ) -> Result<(), String> {
        svm.expire_blockhash();
        let blockhash = svm.latest_blockhash();
        let tx =
            Transaction::new_signed_with_payer(instructions, Some(fee_payer), signers, blockhash);
        svm.send_transaction(tx)
            .map(|_| ())
            .map_err(|err| format!("{err:?}"))
    }

    fn set_time(svm: &mut LiteSVM, unix_timestamp: i64) {
        svm.set_sysvar(&Clock {
            unix_timestamp,
            ..Clock::default()
        });
    }

    fn token_amount(svm: &LiteSVM, token_account: &Pubkey) -> u64 {
        let account = svm
            .get_account(token_account)
            .expect("token account missing");
        u64::from_le_bytes(account.data[64..72].try_into().unwrap())
    }

    fn token_delegate(svm: &LiteSVM, token_account: &Pubkey) -> Option<Pubkey> {
        let account = svm
            .get_account(token_account)
            .expect("token account missing");
        let data = &account.data;
        let tag = u32::from_le_bytes(data[72..76].try_into().unwrap());
        if tag == 0 {
            None
        } else {
            Some(Pubkey::new_from_array(data[76..108].try_into().unwrap()))
        }
    }

    fn token_delegated_amount(svm: &LiteSVM, token_account: &Pubkey) -> u64 {
        let account = svm
            .get_account(token_account)
            .expect("token account missing");
        u64::from_le_bytes(account.data[121..129].try_into().unwrap())
    }

    fn invoice_state(svm: &LiteSVM, invoice: &Pubkey) -> Invoice {
        let account = svm.get_account(invoice).expect("invoice account missing");
        Invoice::try_deserialize(&mut &account.data[..]).unwrap()
    }

    struct Env {
        svm: LiteSVM,
        issuer: Keypair,
        payer: Keypair,
        lp: Keypair,
        invoice: Pubkey,
        mint: Pubkey,
        payer_token_account: Pubkey,
        issuer_token_account: Pubkey,
        lp_token_account: Pubkey,
        vault_authority: Pubkey,
    }

    fn setup(due_ts: i64) -> Env {
        let mut svm = LiteSVM::new().with_default_programs().with_sysvars();
        set_time(&mut svm, T0);

        let program_bytes = include_bytes!("../../../target/deploy/termin.so");
        svm.add_program(PROGRAM_ID, program_bytes).unwrap();

        let issuer = Keypair::new();
        let payer = Keypair::new();
        let lp = Keypair::new();
        svm.airdrop(&issuer.pubkey(), 100 * LAMPORTS_PER_SOL)
            .unwrap();
        svm.airdrop(&payer.pubkey(), 100 * LAMPORTS_PER_SOL)
            .unwrap();
        svm.airdrop(&lp.pubkey(), 100 * LAMPORTS_PER_SOL).unwrap();

        let mint_keypair = Keypair::new();
        let rent_mint = svm.minimum_balance_for_rent_exemption(MINT_LEN);
        let create_mint = system_create_account_ix(
            &issuer.pubkey(),
            &mint_keypair.pubkey(),
            rent_mint,
            MINT_LEN as u64,
            &token_program_id(),
        );
        let initialize_mint = init_mint_ix(&mint_keypair.pubkey(), 6, &issuer.pubkey());
        send(
            &mut svm,
            &[create_mint, initialize_mint],
            &[&issuer as &dyn Signer, &mint_keypair as &dyn Signer],
            &issuer.pubkey(),
        )
        .unwrap();

        let payer_token_keypair = Keypair::new();
        let issuer_token_keypair = Keypair::new();
        let lp_token_keypair = Keypair::new();
        let rent_token = svm.minimum_balance_for_rent_exemption(TOKEN_ACCOUNT_LEN);
        let mut ixs = Vec::new();
        ixs.extend(create_token_account_ixs(
            &payer.pubkey(),
            &payer_token_keypair.pubkey(),
            &mint_keypair.pubkey(),
            &payer.pubkey(),
            rent_token,
        ));
        ixs.extend(create_token_account_ixs(
            &payer.pubkey(),
            &issuer_token_keypair.pubkey(),
            &mint_keypair.pubkey(),
            &issuer.pubkey(),
            rent_token,
        ));
        ixs.extend(create_token_account_ixs(
            &payer.pubkey(),
            &lp_token_keypair.pubkey(),
            &mint_keypair.pubkey(),
            &lp.pubkey(),
            rent_token,
        ));
        send(
            &mut svm,
            &ixs,
            &[
                &payer as &dyn Signer,
                &payer_token_keypair as &dyn Signer,
                &issuer_token_keypair as &dyn Signer,
                &lp_token_keypair as &dyn Signer,
            ],
            &payer.pubkey(),
        )
        .unwrap();

        let fund_payer = mint_to_ix(
            &mint_keypair.pubkey(),
            &payer_token_keypair.pubkey(),
            &issuer.pubkey(),
            2_000 * ONE_TOKEN,
        );
        let fund_lp = mint_to_ix(
            &mint_keypair.pubkey(),
            &lp_token_keypair.pubkey(),
            &issuer.pubkey(),
            1_000 * ONE_TOKEN,
        );
        send(
            &mut svm,
            &[fund_payer, fund_lp],
            &[&issuer as &dyn Signer],
            &issuer.pubkey(),
        )
        .unwrap();

        let invoice_id = 1u64;
        let invoice = invoice_pda(&issuer.pubkey(), invoice_id);
        let create = create_invoice_ix(
            &issuer.pubkey(),
            &payer.pubkey(),
            &mint_keypair.pubkey(),
            &invoice,
            invoice_id,
            AMOUNT,
            due_ts,
        );
        send(&mut svm, &[create], &[&issuer as &dyn Signer], &issuer.pubkey()).unwrap();

        let vault_authority = vault_authority_pda(&invoice);

        Env {
            svm,
            issuer,
            payer,
            lp,
            invoice,
            mint: mint_keypair.pubkey(),
            payer_token_account: payer_token_keypair.pubkey(),
            issuer_token_account: issuer_token_keypair.pubkey(),
            lp_token_account: lp_token_keypair.pubkey(),
            vault_authority,
        }
    }

    fn authorize(env: &mut Env) {
        let ix = authorize_invoice_ix(
            &env.payer.pubkey(),
            &env.mint,
            &env.invoice,
            &env.payer_token_account,
            &env.vault_authority,
        );
        send(&mut env.svm, &[ix], &[&env.payer as &dyn Signer], &env.payer.pubkey()).unwrap();
    }

    fn collect(env: &mut Env) -> Result<(), String> {
        let ix = collect_invoice_ix(
            &env.mint,
            &env.invoice,
            &env.payer_token_account,
            &env.issuer_token_account,
            &env.lp_token_account,
            &env.vault_authority,
        );
        send(
            &mut env.svm,
            &[ix],
            &[&env.payer as &dyn Signer],
            &env.payer.pubkey(),
        )
    }

    #[test]
    fn test_on_time_collect_no_fee() {
        let mut env = setup(T0 + 3_600);
        authorize(&mut env);

        assert_eq!(
            token_delegate(&env.svm, &env.payer_token_account),
            Some(env.vault_authority)
        );
        let fee_max = AMOUNT * FEE_CAP_BPS as u64 / BPS;
        assert_eq!(
            token_delegated_amount(&env.svm, &env.payer_token_account),
            AMOUNT + fee_max
        );

        set_time(&mut env.svm, T0 + 3_600);
        collect(&mut env).unwrap();

        let invoice = invoice_state(&env.svm, &env.invoice);
        assert_eq!(invoice.status, InvoiceStatus::Collected);
        assert_eq!(invoice.fee_paid, 0);
        assert_eq!(token_amount(&env.svm, &env.issuer_token_account), AMOUNT);
        assert_eq!(
            token_amount(&env.svm, &env.payer_token_account),
            2_000 * ONE_TOKEN - AMOUNT
        );
    }

    #[test]
    fn test_overdue_collect_with_fee() {
        let mut env = setup(T0 - 2 * DAY);
        authorize(&mut env);

        let flag = flag_overdue_ix(&env.invoice);
        send(
            &mut env.svm,
            &[flag],
            &[&env.payer as &dyn Signer],
            &env.payer.pubkey(),
        )
        .unwrap();
        let invoice = invoice_state(&env.svm, &env.invoice);
        assert_eq!(invoice.status, InvoiceStatus::Overdue);
        assert_eq!(invoice.overdue_ts, T0);

        collect(&mut env).unwrap();

        let expected_fee = AMOUNT * FEE_BPS_PER_DAY as u64 * 2 / BPS;
        let invoice = invoice_state(&env.svm, &env.invoice);
        assert_eq!(invoice.status, InvoiceStatus::Collected);
        assert_eq!(invoice.fee_paid, expected_fee);
        assert_eq!(
            token_amount(&env.svm, &env.issuer_token_account),
            AMOUNT + expected_fee
        );
        assert_eq!(
            token_amount(&env.svm, &env.payer_token_account),
            2_000 * ONE_TOKEN - AMOUNT - expected_fee
        );
    }

    #[test]
    fn test_collect_before_due_fails() {
        let mut env = setup(T0 + DAY);
        authorize(&mut env);
        assert!(collect(&mut env).is_err());
    }

    #[test]
    fn test_flag_overdue_before_due_fails() {
        let mut env = setup(T0 + DAY);
        authorize(&mut env);
        let flag = flag_overdue_ix(&env.invoice);
        assert!(send(
            &mut env.svm,
            &[flag],
            &[&env.payer as &dyn Signer],
            &env.payer.pubkey(),
        )
        .is_err());
    }

    #[test]
    fn test_advance_and_collect_waterfall() {
        let mut env = setup(T0 + DAY);
        authorize(&mut env);

        let advance_in = 900 * ONE_TOKEN;
        let payout = AMOUNT;
        let advance = advance_invoice_ix(
            &env.lp.pubkey(),
            &env.mint,
            &env.invoice,
            &env.lp_token_account,
            &env.issuer_token_account,
            advance_in,
            payout,
        );
        send(&mut env.svm, &[advance], &[&env.lp as &dyn Signer], &env.lp.pubkey()).unwrap();

        let invoice = invoice_state(&env.svm, &env.invoice);
        assert_eq!(invoice.lp, env.lp.pubkey());
        assert_eq!(invoice.advance_in, advance_in);
        assert_eq!(invoice.advance_payout, payout);
        assert_eq!(
            token_amount(&env.svm, &env.issuer_token_account),
            advance_in
        );

        set_time(&mut env.svm, T0 + 3 * DAY);
        collect(&mut env).unwrap();

        let expected_fee = AMOUNT * FEE_BPS_PER_DAY as u64 * 2 / BPS;
        assert_eq!(
            token_amount(&env.svm, &env.lp_token_account),
            1_000 * ONE_TOKEN - advance_in + payout
        );
        assert_eq!(
            token_amount(&env.svm, &env.issuer_token_account),
            advance_in + expected_fee
        );
        assert_eq!(
            token_amount(&env.svm, &env.payer_token_account),
            2_000 * ONE_TOKEN - AMOUNT - expected_fee
        );
        assert_eq!(invoice_state(&env.svm, &env.invoice).fee_paid, expected_fee);
    }

    #[test]
    fn test_double_collect_fails() {
        let mut env = setup(T0 - DAY);
        authorize(&mut env);
        collect(&mut env).unwrap();
        assert!(collect(&mut env).is_err());
    }

    #[test]
    fn test_revoke_before_due_blocks_collect() {
        let mut env = setup(T0 + DAY);
        authorize(&mut env);

        let revoke = revoke_invoice_ix(
            &env.payer.pubkey(),
            &env.invoice,
            &env.payer_token_account,
        );
        send(
            &mut env.svm,
            &[revoke],
            &[&env.payer as &dyn Signer],
            &env.payer.pubkey(),
        )
        .unwrap();

        let invoice = invoice_state(&env.svm, &env.invoice);
        assert_eq!(invoice.status, InvoiceStatus::Revoked);
        assert_eq!(token_delegate(&env.svm, &env.payer_token_account), None);

        set_time(&mut env.svm, T0 + DAY);
        assert!(collect(&mut env).is_err());
    }

    #[test]
    fn test_reauthorize_after_revoke_then_collect() {
        let mut env = setup(T0 + DAY);
        authorize(&mut env);

        let revoke = revoke_invoice_ix(
            &env.payer.pubkey(),
            &env.invoice,
            &env.payer_token_account,
        );
        send(
            &mut env.svm,
            &[revoke],
            &[&env.payer as &dyn Signer],
            &env.payer.pubkey(),
        )
        .unwrap();

        authorize(&mut env);
        assert_eq!(
            token_delegate(&env.svm, &env.payer_token_account),
            Some(env.vault_authority)
        );
        assert_eq!(
            invoice_state(&env.svm, &env.invoice).status,
            InvoiceStatus::Authorized
        );

        set_time(&mut env.svm, T0 + DAY);
        collect(&mut env).unwrap();
        assert_eq!(
            invoice_state(&env.svm, &env.invoice).status,
            InvoiceStatus::Collected
        );
    }

    #[test]
    fn test_revoke_after_due_fails() {
        let mut env = setup(T0 - 10);
        authorize(&mut env);

        let revoke = revoke_invoice_ix(
            &env.payer.pubkey(),
            &env.invoice,
            &env.payer_token_account,
        );
        assert!(send(
            &mut env.svm,
            &[revoke],
            &[&env.payer as &dyn Signer],
            &env.payer.pubkey(),
        )
        .is_err());
        assert_eq!(
            invoice_state(&env.svm, &env.invoice).status,
            InvoiceStatus::Authorized
        );
    }

    #[test]
    fn test_double_advance_fails_and_advance_blocks_revoke() {
        let mut env = setup(T0 + DAY);
        authorize(&mut env);

        let advance = advance_invoice_ix(
            &env.lp.pubkey(),
            &env.mint,
            &env.invoice,
            &env.lp_token_account,
            &env.issuer_token_account,
            100 * ONE_TOKEN,
            AMOUNT,
        );
        send(
            &mut env.svm,
            &[advance.clone()],
            &[&env.lp as &dyn Signer],
            &env.lp.pubkey(),
        )
        .unwrap();
        assert!(send(
            &mut env.svm,
            &[advance],
            &[&env.lp as &dyn Signer],
            &env.lp.pubkey(),
        )
        .is_err());

        let revoke = revoke_invoice_ix(
            &env.payer.pubkey(),
            &env.invoice,
            &env.payer_token_account,
        );
        assert!(send(
            &mut env.svm,
            &[revoke],
            &[&env.payer as &dyn Signer],
            &env.payer.pubkey(),
        )
        .is_err());
    }

    #[test]
    fn test_cancel_created_only() {
        let mut env = setup(T0 + DAY);

        let cancel = cancel_invoice_ix(&env.issuer.pubkey(), &env.invoice);
        send(
            &mut env.svm,
            &[cancel],
            &[&env.issuer as &dyn Signer],
            &env.issuer.pubkey(),
        )
        .unwrap();
        assert_eq!(
            invoice_state(&env.svm, &env.invoice).status,
            InvoiceStatus::Cancelled
        );

        let authorize_ix = authorize_invoice_ix(
            &env.payer.pubkey(),
            &env.mint,
            &env.invoice,
            &env.payer_token_account,
            &env.vault_authority,
        );
        assert!(send(
            &mut env.svm,
            &[authorize_ix],
            &[&env.payer as &dyn Signer],
            &env.payer.pubkey(),
        )
        .is_err());
    }
}
