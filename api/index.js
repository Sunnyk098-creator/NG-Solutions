import { initializeApp } from "firebase/app";
import { getDatabase, ref, get, query, orderByChild, equalTo, update, increment, set, runTransaction } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyAKgVkFmFSQPza_RxYtUsTuHkQAtjTZGuo",
  authDomain: "ng-solutions-646d2.firebaseapp.com",
  databaseURL: "https://ng-solutions-646d2-default-rtdb.firebaseio.com",
  projectId: "ng-solutions-646d2",
  storageBucket: "ng-solutions-646d2.firebasestorage.app",
  messagingSenderId: "784270312498",
  appId: "1:784270312498:web:833d6031cff506bd3c282b"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Updated Bot Token
const BOT_TOKEN = "8693608824:AAEL1cpKQUBaMdtUPeRnsldJ_8UXaQq6ctE";

function getExactDate() {
    return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
}

async function sendTelegramMsg(chatId, text) {
    try {
        if (!chatId) return false;
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'HTML' })
        });
        return true;
    } catch (e) { return false; }
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');

    if (req.method === 'GET' && Object.keys(req.query || {}).length === 0) {
        return res.redirect(302, 'https://ng-solutions.vercel.app');
    }

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        let body = req.body || {};
        if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) {} }

        // ==========================================
        // 1. INTERNAL APP ACTIONS (Dashboard UI)
        // ==========================================
        if (body.action) {
            const action = body.action;
            const data = body.data || {};

            if (action === 'CLEAR_HISTORY') {
                const phone = data.phone;
                if(!phone) throw new Error("Missing user identification");
                const tSnap = await get(ref(db, "transactions"));
                let updates = {};
                if(tSnap.exists()) {
                    tSnap.forEach(c => {
                        let t = c.val();
                        if(t.senderId === phone || t.receiverId === phone) updates[`transactions/${t.id}`] = null;
                    });
                }
                if (Object.keys(updates).length > 0) await update(ref(db), updates);
                return res.json({ data: "Success" });
            }

            if (action === 'CHECK_USER') {
                let targetPhone = String(data.phone || '').trim();
                let normalizedInput = targetPhone.toLowerCase(); 
                const customSnap = await get(ref(db, `custom_ids/${normalizedInput}`));
                if (customSnap.exists()) targetPhone = customSnap.val(); 
                
                const snap = await get(ref(db, `users/${targetPhone}`));
                let userData = snap.exists() ? snap.val() : null;
                if (userData) userData.resolvedPhone = targetPhone; 
                else {
                    const fallbackSnap = await get(ref(db, `users/${data.phone || ''}`));
                    if (fallbackSnap.exists()) { userData = fallbackSnap.val(); userData.resolvedPhone = data.phone; }
                }
                return res.json({ data: userData });
            }

            if (action === 'LOGIN') {
                const snap = await get(ref(db, `users/${data.phone || ''}`));
                if (!snap.exists() || snap.val().password !== data.password) throw new Error("Invalid Phone or Password!");
                if (snap.val().isBanned) throw new Error("Account is Banned.");
                return res.json({ data: snap.val() });
            }

            if (action === 'REGISTER') {
                const snap = await get(ref(db, `users/${data.phone || ''}`));
                if (snap.exists()) throw new Error("Phone number already registered!");
                await set(ref(db, `users/${data.phone || ''}`), data.userObj);
                return res.json({ data: "Success" });
            }

            if (action === 'UPDATE_CREDS') {
                await update(ref(db, `users/${data.phone}`), { password: data.password, pin: data.pin });
                return res.json({ data: "Success" });
            }
            
            if (action === 'UPDATE_PROFILE') {
                const { phone, name, tgUserId, botAlerts, email } = data;
                const updates = {};
                if(name !== undefined) updates[`users/${phone}/name`] = name;
                if(tgUserId !== undefined) updates[`users/${phone}/tgUserId`] = tgUserId;
                if(botAlerts !== undefined) updates[`users/${phone}/botAlerts`] = botAlerts;
                if(email !== undefined) updates[`users/${phone}/email`] = email;
                await update(ref(db), updates);
                return res.json({ data: "Success" });
            }

            if (action === 'UPDATE_DP') {
                if(!data.phone || !data.dp) throw new Error("Missing details");
                await update(ref(db, `users/${data.phone}`), { dp: data.dp });
                return res.json({ data: "Success" });
            }
            
            if (action === 'SET_CUSTOM_ID') {
                const { phone, customId } = data;
                const normalizedCustomId = String(customId).toLowerCase().trim(); 
                const uSnap = await get(ref(db, `users/${phone}`));
                if (!uSnap.exists()) throw new Error("User not found!");
                const user = uSnap.val();
                let currentBal = Number(user.balance) || 0;
                const cost = 5;
                if (currentBal < cost) throw new Error("Insufficient Balance for Custom ID!");
                const cidSnap = await get(ref(db, `custom_ids/${normalizedCustomId}`));
                if (cidSnap.exists()) throw new Error("Custom ID already taken!");
                
                const updates = {};
                updates[`users/${phone}/balance`] = currentBal - cost;
                updates[`users/${phone}/customId`] = normalizedCustomId;
                updates[`custom_ids/${normalizedCustomId}`] = phone;
                await update(ref(db), updates);
                return res.json({ data: "Success" });
            }

            if (action === 'UPDATE_PREFS') {
                const updates = {};
                if(data.theme !== undefined) updates[`users/${data.phone}/theme`] = data.theme;
                if(data.tag !== undefined) updates[`users/${data.phone}/tag`] = data.tag;
                if(data.accentColor !== undefined) updates[`users/${data.phone}/accentColor`] = data.accentColor;
                if(data.customUserTag !== undefined) updates[`users/${data.phone}/customUserTag`] = data.customUserTag;
                await update(ref(db), updates);
                return res.json({ data: "Success" });
            }

            if (action === 'GENERATE_API') {
                await update(ref(db, `users/${data.phone}`), { apiKey: data.newKey }); 
                return res.json({ data: "Success" });
            }

            if (action === 'SET_CUSTOM_API') {
                const { phone, newKey } = data;
                if (!newKey || /\s/.test(newKey)) throw new Error("Invalid API Key!");
                const usersSnap = await get(ref(db, 'users'));
                let exists = false;
                if(usersSnap.exists()){ usersSnap.forEach(u => { if(u.val().apiKey === newKey && u.key !== phone) exists = true; }); }
                if(exists) throw new Error("API Key already taken!");
                await update(ref(db, `users/${phone}`), { apiKey: newKey });
                return res.json({ data: "Success" });
            }

            if (action === 'UPDATE_PRIVACY') {
                await update(ref(db), { [`users/${data.phone}/privacyMode`]: data.privacyMode });
                return res.json({ data: "Success" });
            }

            if (action === 'TOGGLE_TXN_VISIBILITY') {
                const { phone, txnId, isHidden } = data;
                await update(ref(db), { [`users/${phone}/hiddenTxns/${txnId}`]: isHidden ? true : null });
                return res.json({ data: "Success" });
            }

            if (action === 'SYNC') {
                if (!data.phone) return res.json({ error: "invalid" });
                try {
                    const [uSnap, cSnap, tSnap, pSnap] = await Promise.all([ 
                        get(ref(db, `users/${data.phone}`)), get(ref(db, "settings")), get(ref(db, "transactions")), get(ref(db, "posts"))
                    ]);
                    let userData = uSnap.val() || {};
                    
                    let txns = [];
                    if(tSnap.exists()) {
                        tSnap.forEach(c => {
                            let t = c.val();
                            if(t && (t.senderId === data.phone || t.receiverId === data.phone)) txns.push(t);
                        });
                    }
                    txns.sort((a, b) => b.timestamp - a.timestamp);
                    let postsArr = []; if (pSnap.exists()) pSnap.forEach(p => { postsArr.push(p.val()); });
                    return res.json({ data: { user: userData, settings: cSnap.val() || {}, txns: txns, posts: postsArr }});
                } catch (syncErr) {
                    return res.json({ error: "invalid sync" });
                }
            }

            if (action === 'EXECUTE_TXN') {
                let amt = Number(data.amount) || 0;
                const uSnap = await get(ref(db, `users/${data.sender}`));
                if (!uSnap.exists()) throw new Error("User not found!");
                let sBal = Number(uSnap.val().balance) || 0;
                let sKeeper = Number(uSnap.val().keeperBalance) || 0;
                
                if (['SEND', 'GHOST_SEND', 'WITHDRAW', 'KEEPER_LOCK'].includes(data.mode)) { if (sBal < amt) throw new Error("Insufficient Balance!"); }
                if (data.mode === 'KEEPER_WITHDRAW') { if (sKeeper < amt) throw new Error("Insufficient Keeper Balance!"); }

                const updates = {};
                if (data.mode === 'SEND' || data.mode === 'GHOST_SEND') {
                    const rSnap = await get(ref(db, `users/${data.receiver}`));
                    if (!rSnap.exists()) throw new Error("Receiver not found!");
                    updates[`users/${data.sender}/balance`] = increment(-amt); 
                    updates[`users/${data.receiver}/balance`] = increment(amt);
                }
                else if (data.mode === 'WITHDRAW') updates[`users/${data.sender}/balance`] = increment(-amt);
                else if (data.mode === 'KEEPER_LOCK') { updates[`users/${data.sender}/balance`] = increment(-amt); updates[`users/${data.sender}/keeperBalance`] = increment(amt); } 
                else if (data.mode === 'KEEPER_WITHDRAW') { updates[`users/${data.sender}/keeperBalance`] = increment(-amt); updates[`users/${data.sender}/balance`] = increment(amt); } 
                else if (data.mode === 'DEPOSIT') updates[`users/${data.sender}/balance`] = increment(amt);
                
                if(data.txn) {
                    data.txn.date = getExactDate();
                    updates[`transactions/${data.txn.id}`] = data.txn;
                }
                await update(ref(db), updates); 
                return res.json({ data: "Success" });
            }

            if (action === 'BULK_PAY') {
                let total = Number(data.amount) * data.receivers.length;
                const uSnap = await get(ref(db, `users/${data.sender}`));
                if (!uSnap.exists() || Number(uSnap.val().balance) < total) throw new Error("Insufficient Balance!");
                
                const updates = { [`users/${data.sender}/balance`]: increment(-total) };
                for(let num of data.receivers) {
                    updates[`users/${num}/balance`] = increment(Number(data.amount));
                    let tId = 'TXN' + Date.now().toString(36).toUpperCase();
                    updates[`transactions/${tId}`] = { id: tId, type: 'out', title: 'Bulk Send', amount: data.amount, status: 'Success', date: getExactDate(), timestamp: Date.now(), icon: 'fa-users', color: 'blue', senderId: data.sender, receiverId: num };
                }
                await update(ref(db), updates);
                return res.json({ data: "Success" });
            }

            if (action === 'CREATE_LIFAFA') {
                const uSnap = await get(ref(db, `users/${data.phone}`));
                let totalDeduction = Number(data.totalDeduction);
                if (!uSnap.exists() || Number(uSnap.val().balance) < totalDeduction) throw new Error("Insufficient Balance!");
                
                let lifId = Math.random().toString(36).substring(2, 14).toUpperCase();
                
                let lifafaData = {
                    id: lifId,
                    createdBy: data.phone,
                    type: data.type || 'standard',
                    amountPerUser: Number(data.amountPerUser) || 0,
                    minAmount: Number(data.minAmount) || 0,
                    maxAmount: Number(data.maxAmount) || 0,
                    totalUsers: Number(data.totalUsers),
                    remainingUsers: Number(data.totalUsers),
                    hasPassword: !!data.password,
                    password: data.password || null,
                    channels: data.channels || [],
                    referActive: data.referActive || false,
                    referAmount: Number(data.referAmount) || 0,
                    status: 'ACTIVE',
                    timestamp: Date.now()
                };

                data.txn.date = getExactDate();

                await update(ref(db), { 
                    [`users/${data.phone}/balance`]: increment(-totalDeduction), 
                    [`lifafas/${lifId}`]: lifafaData, 
                    [`transactions/${data.txn.id}`]: data.txn 
                });
                return res.json({ data: lifId });
            }

            if (action === 'GET_LIFAFA_DETAILS') {
                const lifSnap = await get(ref(db, `lifafas/${data.lifafaId}`));
                if (!lifSnap.exists()) throw new Error("Lifafa not found or expired.");
                let lifafa = lifSnap.val();
                let alreadyClaimed = lifafa.claimers && lifafa.claimers[data.phone] ? true : false;
                
                return res.json({ data: {
                    id: lifafa.id,
                    type: lifafa.type,
                    remainingUsers: lifafa.remainingUsers,
                    totalUsers: lifafa.totalUsers,
                    amountPerUser: lifafa.amountPerUser,
                    hasPassword: lifafa.hasPassword,
                    channels: lifafa.channels || [],
                    referActive: lifafa.referActive,
                    alreadyClaimed: alreadyClaimed
                }});
            }

            if (action === 'VERIFY_LIFAFA_CHANNELS') {
                const lifSnap = await get(ref(db, `lifafas/${data.lifafaId}`));
                if (!lifSnap.exists()) throw new Error("Lifafa not found.");
                let lifafa = lifSnap.val();
                
                if (!lifafa.channels || lifafa.channels.length === 0) return res.json({ data: "Success" }); 

                for (let channel of lifafa.channels) {
                    let url = `https://api.telegram.org/bot${BOT_TOKEN}/getChatMember?chat_id=${channel}&user_id=${data.tgUserId}`;
                    try {
                        let tgRes = await fetch(url);
                        let tgData = await tgRes.json();
                        if (!tgData.ok) throw new Error(`Please join channel: ${channel}`);
                        let status = tgData.result.status;
                        if (!['member', 'administrator', 'creator'].includes(status)) throw new Error(`You have not joined ${channel}`);
                    } catch(err) {
                        throw new Error(err.message || "Failed to verify channel membership.");
                    }
                }
                return res.json({ data: "Success" });
            }

            if (action === 'CLAIM_LIFAFA') {
                const lifafaRef = ref(db, `lifafas/${data.lifafaId}`); 
                await update(ref(db), { dummy: null }); 

                const result = await runTransaction(lifafaRef, (currentData) => {
                    if (currentData === null) return null; 
                    if (currentData.claimers && currentData.claimers[data.phone]) return; 
                    if (currentData.remainingUsers <= 0) return; 
                    
                    if (currentData.hasPassword && currentData.password !== data.password) throw new Error("Incorrect Lifafa Password!");

                    currentData.remainingUsers -= 1; 
                    if (!currentData.claimers) currentData.claimers = {}; 
                    currentData.claimers[data.phone] = true; 
                    return currentData;
                });

                if (!result.committed) throw new Error("Lifafa invalid, empty, or already claimed by you.");
                
                let lifafaData = result.snapshot.val();
                let reward = 0;

                if (lifafaData.type === 'scratch') {
                    let min = Number(lifafaData.minAmount);
                    let max = Number(lifafaData.maxAmount);
                    reward = Math.floor(Math.random() * (max - min + 1)) + min;
                } else if (lifafaData.type === 'coin') {
                    let win = Math.random() < 0.5;
                    reward = win ? (Number(lifafaData.amountPerUser) * 2) : 0;
                } else {
                    reward = Number(lifafaData.amountPerUser);
                }

                const updates = {};
                updates[`users/${data.phone}/balance`] = increment(reward); 
                data.txn.date = getExactDate();
                data.txn.amount = reward;
                updates[`transactions/${data.txn.id}`] = data.txn;

                if (lifafaData.referActive && data.referrerPhone && data.referrerPhone !== data.phone) {
                    const refSnap = await get(ref(db, `users/${data.referrerPhone}`));
                    if (refSnap.exists()) {
                        let referReward = Number(lifafaData.referAmount) || 0;
                        if (referReward > 0) {
                            updates[`users/${data.referrerPhone}/balance`] = increment(referReward);
                            let refTxnId = 'TXN' + Date.now().toString(36).toUpperCase();
                            updates[`transactions/${refTxnId}`] = {
                                id: refTxnId, type: 'in', title: 'Lifafa Referral Reward', amount: referReward,
                                status: 'Success', date: getExactDate(), timestamp: Date.now(),
                                icon: 'fa-user-plus', color: 'blue', senderId: 'SYSTEM', receiverId: data.referrerPhone, name: 'Referral System'
                            };
                        }
                    }
                }

                await update(ref(db), updates); 
                return res.json({ data: { amount: reward, type: lifafaData.type, referActive: lifafaData.referActive } });
            }

            if (action === 'CREATE_GIFT') {
                let amt = Number(data.amount) || 0;
                const total = amt * data.users;
                const snap = await get(ref(db, `users/${data.phone}`));
                if (!snap.exists() || Number(snap.val().balance) < total) throw new Error("Insufficient Balance!");
                data.txn.date = getExactDate();
                const updates = { [`users/${data.phone}/balance`]: increment(-total), [`giftcodes/${data.code}`]: { amountPerUser: amt, remainingUsers: data.users, totalUsers: data.users, createdBy: data.phone }, [`transactions/${data.txn.id}`]: data.txn };
                await update(ref(db), updates); return res.json({ data: "Success" });
            }

            if (action === 'CLAIM_GIFT') {
                let resultAmount = 0; const codeRef = ref(db, `giftcodes/${data.code}`); await update(ref(db), { dummy: null }); 
                const result = await runTransaction(codeRef, (currentData) => {
                    if (currentData === null) return null; if (currentData.claimers && currentData.claimers[data.phone]) return; if (currentData.remainingUsers <= 0) return; 
                    currentData.remainingUsers -= 1; if (!currentData.claimers) currentData.claimers = {}; currentData.claimers[data.phone] = true; return currentData;
                });
                if (!result.committed) throw new Error("Code invalid, expired, or already claimed.");
                
                resultAmount = Number(result.snapshot.val().amountPerUser);
                data.txn.date = getExactDate();
                data.txn.amount = resultAmount;
                const updates = { [`users/${data.phone}/balance`]: increment(resultAmount), [`transactions/${data.txn.id}`]: data.txn };
                if (result.snapshot.val().remainingUsers <= 0) updates[`giftcodes/${data.code}`] = null; 
                await update(ref(db), updates); return res.json({ data: resultAmount });
            }

            return res.status(400).json({ error: "Unknown Action" });
        }

        // ==========================================
        // 2. EXTERNAL API LOGIC (from index.js)
        // ==========================================
        const extData = { ...req.query, ...(req.body || {}) };

        if (extData.tguserid) {
            const tgId = String(extData.tguserid).trim();
            const usersRef = ref(db, "users");
            const userSnap = await get(query(usersRef, orderByChild("tgUserId"), equalTo(tgId)));
            
            if (!userSnap.exists()) return res.status(200).json({ status: "error", message: "invalid" });
            
            let userInfo = null;
            userSnap.forEach((child) => {
                userInfo = { phone: child.key, name: child.val().name || "User", balance: Number(child.val().balance) || 0, tgUserId: child.val().tgUserId };
            });
            return res.status(200).json({ status: "success", data: userInfo });
        }

        if (extData.leaderboard !== undefined) {
            const usersSnap = await get(ref(db, "users"));
            let usersList = [];
            if (usersSnap.exists()) {
                usersSnap.forEach((child) => {
                    const u = child.val();
                    if (!u.isBanned) usersList.push({ name: u.name || "Unknown", phone: child.key, balance: Number(u.balance) || 0 });
                });
            }
            usersList.sort((a, b) => b.balance - a.balance);
            return res.status(200).json({ status: "success", data: usersList.slice(0, 3) });
        }

        if (extData.transaction) {
            const txnId = String(extData.transaction).trim();
            const txnSnap = await get(ref(db, `transactions/${txnId}`));
            if (!txnSnap.exists()) return res.status(200).json({ status: "error", message: "invalid" });
            return res.status(200).json({ status: "success", data: txnSnap.val() });
        }

        const { key, token, paytm, amount, comment, number, upi_id } = extData;
        const safeKey = String(key || token || "").trim();
        const safeComment = String(comment || "").trim();
        
        if (!safeKey) return res.status(200).json({ status: "error", message: "invalid" });

        const usersRef = ref(db, "users");
        const adminSnap = await get(query(usersRef, orderByChild("apiKey"), equalTo(safeKey)));
        
        if (!adminSnap.exists()) return res.status(200).json({ status: "error", message: "invalid" });

        let adminPhone = null, adminData = {};
        adminSnap.forEach((child) => { adminPhone = child.key; adminData = child.val() || {}; });
        const currentAdminBal = Number(adminData.balance) || 0;

        if (upi_id) {
            const withdrawAmount = Number(amount);
            if (isNaN(withdrawAmount) || withdrawAmount < 10) return res.status(200).json({ status: "error", message: "Minimum withdrawal amount is ₹10." });
            if (currentAdminBal < withdrawAmount) return res.status(200).json({ status: "error", message: "Insufficient Balance!" });

            const exactDate = getExactDate();
            const txnId = "TXN" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();

            const updates = {};
            updates[`users/${adminPhone}/balance`] = increment(-withdrawAmount);
            updates[`transactions/${txnId}`] = { 
                id: txnId, type: "out", title: "API UPI Withdrawal", amount: withdrawAmount, 
                status: "Pending", date: exactDate, timestamp: Date.now(), 
                icon: "fa-university", color: "blue", name: "Bank Withdraw", 
                number: upi_id, senderName: adminData.name || adminPhone,
                senderId: adminPhone, receiverId: "SYSTEM", isApi: true, comment: safeComment
            };

            await update(ref(db), updates);

            const settingsSnap = await get(ref(db, "settings"));
            let globalAdminChatId = settingsSnap.exists() ? settingsSnap.val().adminChatId : null;
            let withdrawMsg = `📤 <b>API WITHDRAWAL REQUEST</b> 💼✨\n\n👤 API Owner: <b>${adminData.name || adminPhone}</b>\n💰 Amount: ₹${withdrawAmount}\n🏦 UPI ID: <code>${upi_id}</code>\n💬 Comment: ${safeComment || 'None'}\n🧾 Txn ID: <code>${txnId}</code>\n\n🔹 Please process this API request.`;
            if (globalAdminChatId) sendTelegramMsg(globalAdminChatId, withdrawMsg);

            if (adminData.tgUserId) {
                let userMsg = `🏦 API Withdrawal Requested!\nUPI: ${upi_id}\nAmount: ₹${withdrawAmount}\nTxn ID: ${txnId}`;
                sendTelegramMsg(adminData.tgUserId, userMsg);
            }

            return res.status(200).json({ 
                status: "success", 
                message: `Withdrawal request of ₹${withdrawAmount} submitted for UPI: ${upi_id}`,
                data: { transaction_id: txnId, amount: withdrawAmount, upi_id: upi_id, comment: safeComment, sender: adminPhone }
            });
        }
        
        let targetNumber = String(paytm || number || "").trim(); 
        if (!targetNumber || !amount) return res.status(200).json({ status: "error", message: "invalid" });

        const withdrawAmount = Number(amount);
        if (isNaN(withdrawAmount) || withdrawAmount <= 0) return res.status(200).json({ status: "error", message: "invalid amount" });

        const customSnap = await get(ref(db, `custom_ids/${targetNumber.toLowerCase()}`));
        if (customSnap.exists()) targetNumber = customSnap.val();

        if (String(adminPhone) === targetNumber) return res.status(200).json({ status: "error", message: "Cannot send payment to your own number!" });
        if (currentAdminBal < withdrawAmount) return res.status(200).json({ status: "error", message: "Insufficient Balance!" });

        const receiverSnap = await get(ref(db, "users/" + targetNumber));
        if (!receiverSnap.exists()) return res.status(200).json({ status: "error", message: "invalid" });
        let receiverData = receiverSnap.val() || {};

        const exactDate = getExactDate();
        const txnId = "TXN" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();

        const updates = {};
        updates[`users/${adminPhone}/balance`] = increment(-withdrawAmount);
        updates[`users/${targetNumber}/balance`] = increment(withdrawAmount);

        updates[`transactions/${txnId}`] = { 
            id: txnId, type: "out", title: "API Payment", amount: withdrawAmount, 
            status: "Success", date: exactDate, timestamp: Date.now(), 
            icon: "fa-code", color: "blue", name: receiverData.name || targetNumber, 
            number: targetNumber, senderName: adminData.name || adminPhone,
            senderId: adminPhone, receiverId: targetNumber, isApi: true, comment: safeComment
        };

        await update(ref(db), updates);

        let rName = receiverData.name || targetNumber;
        let aName = adminData.name || adminPhone;

        if (adminData.tgUserId) {
            let msg = `🤖 API Payment Sent!\nTo: ${rName}\nAmount: ₹${withdrawAmount}\nTxn ID: ${txnId}`;
            sendTelegramMsg(adminData.tgUserId, msg);
        }
        if (receiverData.tgUserId) {
            let msg = `💰 API Payment Received!\nFrom: ${aName}\nAmount: ₹${withdrawAmount}\nTxn ID: ${txnId}`;
            sendTelegramMsg(receiverData.tgUserId, msg);
        }

        return res.status(200).json({ 
            status: "success", 
            message: `Payment successful to ${targetNumber}`,
            data: { 
                transaction_id: txnId, 
                amount: withdrawAmount, 
                receiver: targetNumber,
                comment: safeComment,
                sender: adminPhone,
                sender_name: aName
            }
        });

    } catch (error) { 
        if (error.message && (error.message.includes("Insufficient") || error.message.includes("not found") || error.message.includes("Password") || error.message.includes("join channel") || error.message.includes("already claimed"))) {
            return res.json({ error: error.message });
        }
        return res.status(500).json({ error: "invalid" }); 
    }
}
