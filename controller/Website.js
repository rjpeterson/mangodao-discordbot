const cheerio           = require('cheerio')
const got               = require('got')
const Guilds            = require('./../crud/Guilds')
const Proposal               = require('../schemas/Proposal')
const { MessageEmbed }  = require('discord.js')
const Proposals              = require('../crud/Proposals')
const I18N              = require('./../utils/I18N')

class Website {
    constructor (discordClient, watch = true) {
        this.discordClient  = discordClient
        this.guildsCrud     = new Guilds()

        if (watch)
            this.watchForNewProposals()
    }

    
    broadcastNewProposals (maps) {
        const guilds = this.guildsCrud.all().filter(g => !!g.setupCompleted && g.mapsChanId && g.mapsChanId.length > 0)
        guilds.forEach((g, i) => {
            setTimeout(async () => {
                try {
                    const guild = this.discordClient.guilds.cache.get(g.id)
                    if (!guild)
                        return 
                    
                    const $t    = new I18N(guild.locale)
                    
                    const guildMapChannel = guild.channels.cache.get(g.mapsChanId)
                    if (maps.length > 1) {
                        const fhLogo    = 'https://www.forgehub.com/styles/forgehub/forgehub/favicon.png'
                        let image       = false 
                        let description = ''
                        maps.forEach((m, j) => {
                            description += `• **${m.title}** by ${m.author} [${this._getEmoteForType(m.type).emote} ${$t.get('type' + m.type)}]. \n`
                            if (!image && m.img)
                                image = m.img
                        })
                        const embed = new MessageEmbed()
                            .setColor('#efefef')
                            .setTitle($t.get('newMapOnSite', { number: maps.length }, maps.length))
                            .setURL('https://www.forgehub.com/maps')
                            .setThumbnail(fhLogo)
                            .setAuthor('ForgeHub', fhLogo, 'https://www.forgehub.com/')
                            .setDescription(description)
                        
                        if (image) 
                            embed.setImage(image)

                        guildMapChannel.send(embed)
                            .catch(err => process.dLogger.log(`in controller/Website/broadcastNewProposals: ${err.message}`))
                    } else {
                        maps.forEach((m, j) => {
                            setTimeout(() => {
                                guildMapChannel.send($t.get('newMapOnSite'))
                                    .then(() => {
                                        guildMapChannel.send(this.generateEmbed(m, $t))
                                            .catch(err => process.dLogger.log(`in controller/Website/broadcastNewProposals: ${err.message}`))
                                    })
                                    .catch(err => process.dLogger.log(`in controller/Website/broadcastNewProposals: ${err.message}`))
                            }, j * 60000) // to avoid Discord API rate limit
                        })
                    }
                } catch (err) {
                    process.dLogger.log(`in controller/Website/broadcastNewProposals: ${err.message}`)
                }
            }, i * 2000) // to avoid Discord API rate limit
        })
    }

    async fetchProposalList () {
        try {
            const { body }  = await got('https://www.https://dao.mango.markets/#/realm/DPiH3H3c7t47BMxqTxLsuPQpEC6Kne8GA9VXbxpnZxFE')
            const $         = cheerio.load(body)
            return $
        } catch (err) {
            process.dLogger.log(`in controller/Website/fetchProposalList: ${err.message}`)
        }
    }

    generateEmbed (proposal, $t) {
        const MMLogo = 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/MangoCzJ36AjZyKwVj3VnYU4GTonjfVEnJmvvWaxLac/token.png'
        const embed = new MessageEmbed()
            .setColor('#efefef')
            .setTitle(proposal.address)
            .setURL(proposal.link)
            .setThumbnail(MMLogo)
            .setAuthor('MangoMarkets', MMLogo, 'https://www.dao.mango.markets/')
            .setDescription(proposal.tokenBalance)
            // .addField($t.get('author'), proposal.author, true)
            // .addField($t.get('mapType'), this._getEmoteForType(proposal.type).emote + $t.get(`type${proposal.type}`), true)
            // .setFooter(this._genFooter(proposal, $t))

        if (proposal.img) 
            embed.setImage(proposal.img)

        return embed
    }

    getNewProposalsObjFromHTML (html, forceNew = true) {
        const list      = html('ul.ant-list-items> li')
        const newProposals   = []
        for (let i in list) {
            const li = list[i]

            if (typeof li.attribs === 'undefined' || typeof li.attribs.id === 'undefined')
                continue 
            const governanceId = html(`li .ant-list-item-meta-title`).text()
            // const id = li.attribs.id

            if (forceNew && !this._isNew(governanceId))
                continue 
            
            // const image = html(`li#${id} .resourceIcon > img`).attr('src')

            newProposals.push({
                address      : html(`li .ant-list-item-meta-title`).text(),
                tokenBalance : html(`li .ant-list-item-meta-description`).text(),
                link : 'https://dao.mango.markets/#/realm/DPiH3H3c7t47BMxqTxLsuPQpEC6Kne8GA9VXbxpnZxFE',
                // id          : id, 
                // img         : typeof image !== 'undefined' ? `https://www.forgehub.com/${image}` : null, 
                // desc        : html(`li#${id} .tagLine`).text().replace(/\r?\n|\r|\t/g, ''), 
                // link        : `https://www.forgehub.com/${html(`li#${id} .resourceLink`).attr('href')}`,
                // nbComments  : html(`li#${id} .stat.comments`).text(),
                // nbDl        : html(`li#${id} .stat.downloads`).text(),
                // nbViews     : html(`li#${id} .stat.views`).text(),
                // title       : html(`li#${id} .resourceLink`).text(), 
                // type        : html(`li#${id} .optimalPlayerCount`).text(), 
            })
        }
        
        if (newProposals.length > 0)
            this._saveProposals(newProposals)

        return newProposals
    }

    async getLatestProposal (message) {
        try {
            const guild     = this.guildsCrud.getById(message.guild.id)
            const $t        = new I18N(guild.locale)
            const proposalList   = await this.fetchProposalList()
            if (!proposalList)
                return message.channel.send($t.get('errorCantFindProposal'))
            
            const newProposals = this.getNewProposalsObjFromHTML(proposalList, false)
            if (newProposals && newProposals.length > 0 ) {
                message.channel.send(this.generateEmbed(newProposals[0], $t))
                    .catch(err => process.dLogger.log(`in controller/Website/broadcastNewProposals: ${err.message}`))
            } else 
                message.channel.send($t.get('errorCantFindProposal'))
        } catch (err) {
            message.channel.send($t.get('errorCantFindPropsal'))
            process.dLogger.log(`in controller/Website/getLatestProposal: ${err.message}`)
        }
    }

    async watchForNewProposals () {
        const check = async () => {
            const proposalList = await this.fetchProposalList()
            if (!proposalList)
                return 
            
            const newProposals = this.getNewProposalsObjFromHTML(proposalList)
            if (newProposals && newProposals.length > 0 )
                this.broadcastNewProposals(newProposals)
        }
        check()
        setInterval(check, 4 * 3600 * 1000) // every four hours
    }

    // _genFooter (proposal, $t) {
    //     return `${map.nbDl} ${$t.get('nbDownloads', {}, map.nbDl)} | ${map.nbComments} ${$t.get('nbComments', {}, map.nbComments)} | ${map.nbViews} ${$t.get('nbViews', {}, map.nbViews)}`
    // }

    // _getEmoteForType (type) {
    //     const types = [
    //         {
    //             type    : 'Race',
    //             emote   : '🏁 '
    //         },
    //         {
    //             type    : '1v1',
    //             emote   : '🎯 '
    //         },
    //         {
    //             type    : '2v2',
    //             emote   : '🎯 '
    //         },
    //         {
    //             type    : '3v3',
    //             emote   : '🎯 '
    //         },
    //         {
    //             type    : '4v4',
    //             emote   : '🎯 '
    //         },
    //         {
    //             type    : '5v5',
    //             emote   : '🎯 '
    //         },
    //         {
    //             type    : '6v6',
    //             emote   : '🎯 '
    //         },
    //         {
    //             type    : '7v7',
    //             emote   : '🎯 '
    //         },
    //         {
    //             type    : '8v8',
    //             emote   : '🎯 '
    //         },
    //         {
    //             type    : 'Infection',
    //             emote   : '☣️ '
    //         },
    //         {
    //             type    : 'Extermination',
    //             emote   : '☠️ '
    //         },
    //         {
    //             type    : 'MiniGame',
    //             emote   : '🎲 '
    //         },
    //         {
    //             type    : 'Grifball',
    //             emote   : '🔨 '
    //         },
    //         {
    //             type    : 'Aesthetic',
    //             emote   : '🖼️ '
    //         },
    //         {
    //             type    : 'Puzzle',
    //             emote   : '🧩 '
    //         },
    //         {
    //             type    : 'Custom',
    //             emote   : '💡 '
    //         }
    //     ]

    //     return types.find(el => el.type === type) || ''
    // }

    _isNew (id) {
        return !(new Proposals().getById(id))
    }

    _saveProposals (proposals) {
        const proposalsCrud = new Proposals()
        proposals.forEach(m => proposalsCrud.add(new Proposal(m)))
    }
}

module.exports = Website