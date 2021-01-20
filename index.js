#!/usr/bin/env node

const args = process.argv.slice(2);
const api = require('@actual-app/api');

console.log("\n\n =========== Actual Category Archiver =========== \n\n");

// Parse Input
if(args.filter(Boolean).length !== 2){
    console.error('Invalid arguments, Pass budget id and category name to be archived')
    process.exit()
}


let [budgetId, categoryNameToArchive] = args

// INITIALIZATION
start()

async function start(){
    try {
        await api.runWithBudget(budgetId, run);
    } catch (e){
        process.exit(0);
    }
}

async function run() {
    try {
        const archiveCategoryId = await getOrCreateArchiveCategory();

        const category = (await api.getCategories()).find(c => c.name === categoryNameToArchive)
        if (!category) {
            throw `🛑 ERROR = ${categoryNameToArchive} Category not found 🛑`
        }

        const allTransactions = await api.getTransactions()

        const topLevelTransactions = allTransactions.filter(t => t.category_id === category.id)

        const splitTransactions = allTransactions
            .filter(t => t.category_id === null)
            .map(t => {
                const subtransactions = t.subtransactions ?? []
                return subtransactions.filter(subT => subT.category_id === category.id)
            })
            .flat();

        const transactionsToArchive = [...topLevelTransactions, ...splitTransactions]

        if (transactionsToArchive.length === 0) {
            console.log(`NO transactions found for category ${categoryNameToArchive}`)
            return;
        }

        console.log('ℹ️ Updating notes for category', categoryNameToArchive)
        await updateTransactionNotesWithSource(transactionsToArchive, categoryNameToArchive)

        console.log('ℹ️ Deleting category', categoryNameToArchive)
        await api.deleteCategory(category.id, archiveCategoryId)

        console.log(`Archived ${transactionsToArchive.length} from ${categoryNameToArchive}`)
    } catch (e) {
        console.error(e)
    }
}

async function updateTransactionNotesWithSource(transactionsToUpdate, categoryNameToArchive) {
    const promises = transactionsToUpdate.map((transaction) => {
        return api.updateTransaction(transaction.id, {
            notes: `[source:${categoryNameToArchive}] | ${transaction.notes}`
        })
    })

    await Promise.all(promises)
}

async function getOrCreateArchiveCategory() {
    let archiveCategoryId;
    const archiveCategory = (await api.getCategories()).find(c => c.name === 'Archived');

    if (!archiveCategory) {
        console.log('Could not find Archived category, creating one.')
        archiveCategoryId = await createArchiveCategory()
        console.log('Created Archived category', archiveCategoryId)
    } else {
        archiveCategoryId = archiveCategory.id;
        console.log('Found Archived Category', archiveCategoryId)
    }
    return archiveCategoryId;
}

async function createArchiveCategory() {
    const archiveCategoryGroupId = await getOrCreateArchiveCategoryGroup();
    return api.createCategory({
        name: 'Archived',
        group_id: archiveCategoryGroupId
    })
}

async function getOrCreateArchiveCategoryGroup() {
    let archiveCategoryGroup = await getArchiveCategoryGroup()

    let id;
    if (!archiveCategoryGroup) {
        console.log('Could not find Archived category group, creating one')
        id = await createArchiveCategoryGroup();
        console.log('Archived category group created', id)
    } else {
        id = archiveCategoryGroup.id;
        console.log('Found Archived category group', id)
    }
    return id;
}

async function getArchiveCategoryGroup() {
    const categoryGroups = await api.getCategoryGroups()
    return categoryGroups.find(cg => cg.name === 'Archive Group')
}

function createArchiveCategoryGroup() {
    return api.createCategoryGroup({
        name: 'Archive Group',
        is_income: false
    })
}
