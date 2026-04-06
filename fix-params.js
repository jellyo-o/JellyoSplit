const fs = require('fs');
const path = require('path');

const dir1 = path.join(__dirname, 'src', 'server', 'routes');
const dir2 = path.join(__dirname, 'src', 'server', 'auth');

function processDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            processDir(fullPath);
        } else if (file.endsWith('.ts')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let originalContent = content;

            // Replace const gatheringId = req.params.gatheringId || req.params.id || req.body.gatheringId;
            content = content.replace(/const gatheringId = req\.params\.gatheringId \|\| req\.params\.id \|\| req\.body\.gatheringId;/g, 
                'const gatheringId = (req.params.gatheringId || req.params.id || req.body.gatheringId) as string;');

            // Replace const gatheringId = req.params.gatheringId || req.params.id;
            content = content.replace(/const gatheringId = req\.params\.gatheringId \|\| req\.params\.id;/g, 
                'const gatheringId = (req.params.gatheringId || req.params.id) as string;');

            // Replace const { id } = req.params;
            content = content.replace(/const \{ id \} = req\.params;/g, 
                'const id = req.params.id as string;');

            // Replace const { shareCode } = req.params;
            content = content.replace(/const \{ shareCode \} = req\.params;/g, 
                'const shareCode = req.params.shareCode as string;');

            // Replace const { id, userId } = req.params;
            content = content.replace(/const \{ id, userId \} = req\.params;/g, 
                'const id = req.params.id as string;\n    const userId = req.params.userId as string;');

            // Replace const { participantId } = req.params;
            content = content.replace(/const \{ participantId \} = req\.params;/g, 
                'const participantId = req.params.participantId as string;');

            // Replace const { paymentId } = req.params;
            content = content.replace(/const \{ paymentId \} = req\.params;/g, 
                'const paymentId = req.params.paymentId as string;');

            // Replace const { categoryId } = req.params;
            content = content.replace(/const \{ categoryId \} = req\.params;/g, 
                'const categoryId = req.params.categoryId as string;');

            // Replace const { adjustmentId } = req.params;
            content = content.replace(/const \{ adjustmentId \} = req\.params;/g, 
                'const adjustmentId = req.params.adjustmentId as string;');

            if (content !== originalContent) {
                fs.writeFileSync(fullPath, content, 'utf8');
                console.log(`Updated ${fullPath}`);
            }
        }
    }
}

processDir(dir1);
processDir(dir2);
