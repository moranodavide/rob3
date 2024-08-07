import { Connection, PublicKey } from '@solana/web3.js';

// Solana connection configuration
const SOLANA_RPC_URL =
    'https://solana-mainnet.g.alchemy.com/v2/bnPBOjC_umV9XVb-D4-RURKtfweFMhXp';
const connection = new Connection(SOLANA_RPC_URL);
const TOTAL_RISK_SCORE = 10;

// Function to get program information
async function getProgramInfo(programId) {
    try {
        return await connection.getAccountInfo(new PublicKey(programId));
    } catch (error) {
        console.error('Error getting program info:', error);
        return null;
    }
}

// Convert risk score to trust percentage
function toScorePct(riskScore) {
    let temp = TOTAL_RISK_SCORE - riskScore;
    return Math.round((temp / TOTAL_RISK_SCORE) * 100).toString();
}

// Determine risk level based on score
function getRiskLevel(riskScore) {
    if (riskScore > 7) return 'High Risk';
    if (riskScore > 4) return 'Moderate Risk';
    if (riskScore > 2) return 'Low Risk';
    return 'Very Low Risk';
}

// Provide risk description based on score
function getRiskDesc(riskScore) {
    if (riskScore > 7) return 'Careful review strongly recommended.';
    if (riskScore > 4) return 'Further review recommended.';
    if (riskScore > 2) return 'Not many issues, but exercise caution.';
    return 'Seems safe, but always verify.';
}

// Function for program audit
async function auditProgram(programId) {
    let riskScore = 0;
    let warnings = [];

    try {
        const programInfo = await getProgramInfo(programId);

        // 1. Verifica l'esistenza del programma
        if (!programInfo) {
            riskScore += 10;
            warnings.push('Program not found');
            return { riskScore, warnings };
        }

        // 2. Dimensione del programma
        if (programInfo.data.length < 100) {
            riskScore += 2;
            warnings.push('Very small program size');
        }

        // 3. Eseguibilità
        if (!programInfo.executable) {
            riskScore += 3;
            warnings.push('Program is not executable');
        }

        // 4. Età del programma
        const slot = await connection.getSlot();
        const blockTime = await connection.getBlockTime(slot);
        const programAge = blockTime - programInfo.rentEpoch;
        if (programAge < 86400) {
            // meno di un giorno
            riskScore += 2;
            warnings.push('Very recent program');
        }

        // 5. Frequenza delle transazioni
        const recentSignatures = await connection.getSignaturesForAddress(
            new PublicKey(programId),
            { limit: 1000 }
        );
        const txFrequency = recentSignatures.length / (programAge / 86400);
        if (txFrequency > 100) {
            // più di 100 tx al giorno
            riskScore += 1;
            warnings.push('High transaction frequency');
        }

        // 6. Saldo del programma
        const balance = await connection.getBalance(new PublicKey(programId));
        if (balance > 1000 * 1e9) {
            // più di 1000 SOL
            riskScore += 2;
            warnings.push('Very high program balance');
        }
    } catch (error) {
        console.error('Error in auditProgram:', error);
        riskScore = 10;
        warnings.push('Error auditing program: ' + error.message);
    }

    return { riskScore, warnings };
}

// Function for transaction audit
async function auditTransaction(transactionSignature) {
    let riskScore = 0;
    let warnings = [];

    try {
        const transaction = await connection.getTransaction(
            transactionSignature,
            {
                maxSupportedTransactionVersion: 0,
            }
        );

        if (!transaction) {
            riskScore += 10;
            warnings.push('Transaction not found');
            return { riskScore, warnings };
        }

        // 1. Numero di istruzioni
        const instructionsLength =
            transaction.transaction?.message?.instructions?.length;
        if (instructionsLength && instructionsLength > 5) {
            riskScore += 2;
            warnings.push('Transaction with many instructions');
        }

        // 2. Numero di firmatari
        const signaturesLength = transaction.transaction?.signatures?.length;
        if (signaturesLength && signaturesLength > 1) {
            riskScore += 2;
            warnings.push('Transaction with multiple signers');
        }

        // 3. Analisi delle istruzioni
        /*for (let instruction of transaction.instructions) {
        const programId = instruction.programId.toBase58();
        console.log('Instruction program ID:', programId);

        // Controlla se il programma è noto (questo è un esempio, dovresti espandere questa lista)
        const knownPrograms = [
            '11111111111111111111111111111111',
            'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
        ];
        if (!knownPrograms.includes(programId)) {
            riskScore += 1;
            findings.push(`Interaction with unknown program: ${programId}`);
        }

        const signaturesLength = transaction.transaction?.signatures?.length;
        if (signaturesLength && signaturesLength > 1) {
            riskScore += 2;
            warnings.push('Transaction with multiple signers');
        }
    }*/

        // 4. Simula la transazione
        if (transaction.meta?.postBalances && transaction.meta?.preBalances) {
            const balanceChanges = transaction.meta.postBalances.map(
                (post, index) => {
                    return post - (transaction.meta.preBalances[index] || 0);
                }
            );

            const largeBalanceChanges = balanceChanges.filter(
                (change) => Math.abs(change) > 100 * 1e9
            ).length;
            if (largeBalanceChanges > 0) {
                riskScore += 3;
                warnings.push('Transaction with large balance shifts');
            }
        }

        if (transaction.meta?.err) {
            riskScore += 3;
            warnings.push('Transaction simulation failed');
        }

        if (transaction.meta?.logMessages) {
            const suspiciousLogs = transaction.meta.logMessages.filter(
                (log) =>
                    log.includes('error') ||
                    log.includes('failed') ||
                    log.includes('invalid')
            );
            if (suspiciousLogs.length > 0) {
                riskScore += 2;
                warnings.push('Suspicious log messages detected');
            }
        }
    } catch (error) {
        console.error('Error in auditTransaction:', error);
        riskScore = 10;
        warnings.push('Error processing transaction: ' + error.message);
    }

    return { riskScore, warnings };
}

// Main audit function
async function audit(type, input) {
    try {
        let riskScore, warnings;
        if (type === 'program') {
            ({ riskScore, warnings } = await auditProgram(input));
        } else if (type === 'transaction') {
            ({ riskScore, warnings } = await auditTransaction(input));
        } else {
            throw new Error(
                'Invalid audit type. Use "program" or "transaction".'
            );
        }

        return {
            id: input,
            trustScore: toScorePct(riskScore),
            riskLevel: getRiskLevel(riskScore),
            riskDesc: getRiskDesc(riskScore),
            warnings: warnings,
        };
    } catch (error) {
        console.error('Error in audit:', error);
        return {
            id: input,
            trustScore: '0',
            riskLevel: 'High Risk',
            riskDesc: 'Error occurred during audit',
            warnings: ['Audit failed: ' + error.message],
        };
    }
}

export { audit };

// Tx examples
// 5m8iahwGDcGcBRUwbPUo6SRTSnJm4htgAjcL8bmCudcmButCcG9JHhBdArrYJMyaud1NMYdUpAMfme8BcWfF79W4
// Program ex
// 9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin
