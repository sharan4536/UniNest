const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

const db = admin.firestore();

// Note: Feature 3 (Auto Group Formation) triggers on `isGoingAlone == true` written into eventAttendees
// However, the current client writes event attendees to `eventAttendees/{docId}` not a subcollection `eventAttendees/{eventId}/attendees/{userId}` natively, but we'll monitor `eventAttendees/{attendeeId}`.
exports.autoFormStudyGroup = functions.firestore
    .document('eventAttendees/{attendeeDocId}')
    .onWrite(async (change, context) => {
        const data = change.after.data();
        
        // If deleted or not going alone, do nothing
        if (!data || !data.isGoingAlone || data.status !== 'attending') {
            return null;
        }

        const eventId = data.eventId;
        if (!eventId) return null;

        // Query all users going alone to this event
        const goingAloneSnap = await db.collection('eventAttendees')
            .where('eventId', '==', eventId)
            .where('status', '==', 'attending')
            .where('isGoingAlone', '==', true)
            .get();

        const aloneUsersData = goingAloneSnap.docs.map(doc => doc.data());
        
        // Let's filter out users already in auto-formed groups for this event
        const groupsSnap = await db.collection('studyGroups')
            .where('eventId', '==', eventId)
            .where('autoFormed', '==', true)
            .get();

        const alreadyMatched = new Set();
        groupsSnap.docs.forEach(doc => {
            const members = doc.data().members || [];
            members.forEach(m => alreadyMatched.add(m));
        });

        // Group into units
        const units = [];
        const processedUsers = new Set(alreadyMatched);

        for (const user of aloneUsersData) {
            if (processedUsers.has(user.userId)) continue;
            
            if (user.isPair && user.linkedWith) {
                processedUsers.add(user.userId);
                processedUsers.add(user.linkedWith);
                units.push([user.userId, user.linkedWith]);
            } else {
                processedUsers.add(user.userId);
                units.push([user.userId]);
            }
        }

        // Group size of 3 units
        if (units.length >= 3) {
            const selectedUnits = units.slice(0, 3);
            const groupMembers = selectedUnits.flat();
            const groupId = `autoGrp_${eventId}_${Date.now()}`;
            
            // Create study group
            await db.collection('studyGroups').doc(groupId).set({
                name: "Event Buddy Group 🤝",
                description: "You've been matched with others going to this event! Say hi 👋",
                createdBy: "system",
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                members: groupMembers,
                eventId: eventId,
                autoFormed: true,
                maxMembers: groupMembers.length
            });

            // For now, we will just create a `conversations` doc for the members.
            await db.collection('conversations').add({
                participants: groupMembers,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                lastMessage: {
                    content: "System: You've been matched with others going to the event. Say hi 👋",
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    senderId: "system"
                }
            });

            console.log(`Auto-formed group ${groupId} for event ${eventId} with members: ${groupMembers}`);
        }

        return null;
    });

// TTL Cleanup Fallback for Collections if native Firestore TTL is not enabled
exports.cleanupExpiredDocs = functions.pubsub.schedule('every 15 minutes').onRun(async (context) => {
    const now = admin.firestore.Timestamp.now();
    const batch = db.batch();
    let count = 0;

    const collections = ['pulses', 'sos', 'checkins'];

    for (const collName of collections) {
        const snap = await db.collection(collName).where('expiresAt', '<=', now).limit(150).get();
        snap.docs.forEach(doc => {
            batch.delete(doc.ref);
            count++;
        });
    }

    if (count > 0) {
        await batch.commit();
        console.log(`Cleaned up ${count} expired documents.`);
    }

    return null;
});
