const fs        = require('fs')
const Database  = require('better-sqlite3')
const Proposal       = require('../schemas/Proposal') 

class Proposals {
    constructor () {
        try {
            this.db = new Database('data/proposals.db')

            const createMapTable = `CREATE TABLE IF NOT EXISTS maps (
                id VARCHAR(30) PRIMARY KEY
            );`;
            this.db.exec(createMapTable)
        } catch (err) {
            process.dLogger.log(`in crud/Proposals/constructor: ${err.message}`)
        }
    }

    add (proposal) {
        const checkExistence = this.getById(proposal.id)

        if (!checkExistence) {
            let queryStr    = 'INSERT INTO maps '
            let rowNames    = ''
            let namedValues = '' 

            for (let k in proposal._serialize()) {
                rowNames    += `${k},`
                namedValues += `@${k},`
            }

            rowNames    = rowNames.substring(0, rowNames.length - 1)
            namedValues = namedValues.substring(0, namedValues.length - 1)
            queryStr    += `(${rowNames}) VALUES (${namedValues})`

            const statement = this.db.prepare(queryStr)

            statement.run(proposal._serialize())
        }

        return proposal
    }

    all () {
        const mapsRaw   = this.db.prepare('SELECT * FROM maps').all()
        const maps      = []
        for (const i in mapsRaw) 
            maps.push(new Proposal(mapsRaw[i]))

        return maps
    }

    getById (id) {
        const mapRaw = this.db.prepare('SELECT * FROM maps WHERE id = ? LIMIT 1').get(id)

        return mapRaw ? new Proposal(mapRaw) : null
    }

    remove (id) {
        const info = this.db.prepare('DELETE FROM maps WHERE id = ? LIMIT 1').run(id)
        return info.changes >= 0
    }

    update (args) {
        const currentMap = this.getById(args.id)
        
        if (!currentMap)
            return false 
        
        let queryStr        = 'UPDATE maps SET '

        for (let k in args._serialize()) if (currentGuild.hasOwnProperty(k) && k !== 'id') 
            queryStr += `${k}=@${k},`
        queryStr = `${queryStr.substring(0, queryStr.length - 1)} WHERE id=@id`

        return this.db.prepare(queryStr).run(args._serialize())
    }
}

module.exports = Proposals
