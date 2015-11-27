

Meteor.roomservice = {

    /*
     *      Transforme l'agenda brut
     *  	passe d'une granularité de 1/2 a 1H
     *
     *      @param  agenda   par 1/2h
     *      @return  meetings par heure
     */

    getMeetingsFromAgenda: function (agenda) {
        var meetings = [];
        for (var i = 0; i < (agenda.length); i++) {
            var a = agenda[i];
            var day = moment(a.horaire);
            // conditions :  avant 18  et jour de semaine
            if (day.minute() == 0 &&    // heure pleine
                day.hour() != 18 && day.hour() != 12 && day.hour() != 13 &&  // pas les créneaux de 12h / 13h / 18h
                day.day() != 6 && day.day() != 0) { // pas les samedi & dimanche
                var b = agenda[i + 1];
                var c = {};
                if (day.hour() != 17) {
                    c = agenda[i + 2];
                } // a 17H pas de créneau à 18h30 ...
                var meeting = Meteor.roomservice.getOneMeeting(a, b, c);
                meetings.push(meeting);
            }
        }
        return meetings;
    },

    flipFlapFilter: function (horaire, iNb, categorie) {
        var filter = {};
        filter.categorie = categorie;
        filter.horaire = horaire;
        var isFilter = Filters.findOne({horaire: filter.horaire, categorie: filter.categorie});

        if (isFilter || iNb == 0 ) {
            Filters.remove(isFilter._id);
        } else {
            Filters.insert(filter);
        }
        Session.set('flipFlapFilter', moment().toDate().getTime() );
    },
    /*
     *      compare le nouvel agenda avec l'ancien et met à jour en base
     *
     *      @param  meetings  //  free , oldMeetings //free ..
     *      @return  meeting.isNewFree  meeting.dateFree
     */
    meetingsUpdate: function (meetings, name, mail) {
        var iUpdate = 0;
        var iInsert = 0;
        var iNothing = 0;
        try {
            var decodeName = Meteor.roomservice.decodeRoomName(name);
        }
        catch(err) {
            console.log('--Erreur decode: ' + name);
            return ;
        }
        var isModified;

        for (var i in meetings) {

            meetings[i].name = decodeName.fullname;
            meetings[i].mail = mail;
            meetings[i].categorie = decodeName.categorie;
            meetings[i].idAile = decodeName.idAile;
            meetings[i].etage = decodeName.etage;

            // on recherche l'info sur le précédent

            var currMeeting = Meetings.findOne({$and: [{horaire: meetings[i].horaire}, {mail: mail}]});

            // Si nouveau creneau
            if (!currMeeting) {
                meetings[i].createdAt = moment().toDate();
                isModified = true;
                /*  un nouveau mmeting arrive quand chgt de jour . pas 1 nouveau créneau libre..
                 if (meetings[i].statut == 'free') {
                 meetings[i].dateFree = moment().toDate();
                 }*/
                iInsert++;
                console.log(' -- ' + moment(meetings[i].horaire).format('ddd LLL') + ' -- New --! ');
                Meetings.insert(meetings[i]);

            } else {
                meetings[i].createdAt = currMeeting.createdAt;
                meetings[i].updatedAt = moment().toDate();

                // si créneaau existant identique
                if (meetings[i].statut == currMeeting.statut && // meme statut
                    meetings[i].debut.getTime() == currMeeting.debut.getTime()) {   // meme heure de debut
                    //console.log(moment(meetings[i].horaire).format('ddd LLL') + ' -- ');
                    iNothing++;
                    isModified = false;

                } else {
                    console.log(' -- ' + moment(meetings[i].horaire).format('ddd LLL') + ' ' + currMeeting.statut + ' -> ' + meetings[i].statut);
                    isModified = true;
                    // 3 cas
                    //  passage de busy a free
                    //  passage de free a busy
                    //  modification de la date de début.
                    iUpdate++;

                    // de busy à free
                    if (currMeeting.statut == 'busy' && meetings[i].statut == 'free') {
                        meetings[i].dateFree = moment().toDate();
                    }

                    // de free à busy
                    if (currMeeting.statut == 'free' && meetings[i].statut == 'busy') {
                        meetings[i].dateFree = {};
                    }
                    // om met à jour.
                    Meetings.update(currMeeting._id, meetings[i]); // a ton l'id
                }
            }

            // si meeting modifié , on  met à jours la synthèse sur le créneau ...
            if (isModified) {
                Meteor.roomservice.updSyntheseHoraire(meetings[i].horaire);
            }


            //return ;
        } // fin boucle

        var iTotal = iNothing + iUpdate + iInsert;
        console.log(' -- ' + name.substring(0, 25) + ' Total(' + iTotal + ') unchanged (' + iNothing + ') updated(' + iUpdate + ') inserted(' + iInsert + ') ');


    }
    ,
    /*
     *      recalcule la synthèse  par crénau horaire et met à jour ...
     *
     *      @param  meeting  //  free , oldMeetings //free ..
     *      @return  timeslotstat
     */
    updSyntheseHoraire: function (horaire) {
        var stats = {};

        stats.horaire = horaire;
        stats.iTot = 0 , stats.iTotFree = 0, stats.iNbSalle = 0, stats.iNbBox = 0 , stats.iNbAutre = 0;
        stats.mvt = {};
        stats.mvt.tot = 0, stats.mvt.salle = 0 , stats.mvt.box = 0 , stats.mvt.autre = 0;
        stats.listSalle = [], stats.listBox = [], stats.listAutre = [];
        stats.horaire = horaire;
        var isModified = true;
        var cursor = Meetings.find({horaire: horaire}, {sort: {idAile: 1, etage: 1}}).fetch();
        for (var i in cursor) {
            stats.iTot++;
            if (cursor[i].statut == 'free') {
                switch (cursor[i].categorie) {
                    case "salle":
                        stats.iNbSalle++;
                        stats.listSalle.push(cursor[i]);
                        break;
                    case 'box':
                        stats.iNbBox++;
                        stats.listBox.push(cursor[i]);
                        break;
                    case 'autre':
                        stats.iNbAutre++;
                        stats.listAutre.push(cursor[i]);
                        break;
                    default:
                        Console.log('catégorie  inconnue ' + cursor[i].categorie);
                        break;
                }
            }

        } // fin boucle

        stats.iTotFree = stats.iNbSalle + stats.iNbBox + stats.iNbAutre;
        var lastStat = Timeslots.findOne({horaire: horaire});

        if (lastStat) {
            stats.mvt.tot = stats.iTotFree - lastStat.iTotFree;
            stats.mvt.salle = stats.iNbSalle - lastStat.iNbSalle;
            stats.mvt.box = stats.iNbBox - lastStat.iNbBox;
            stats.mvt.autre = stats.iNbAutre - lastStat.iNbAutre;
            stats.createdAt = lastStat.createdAt;
            stats.updatedAt = moment().toDate();
            Timeslots.update(lastStat._id, stats);
        } else {
            stats.createdAt = moment().toDate();
            Timeslots.insert(stats);
        }

        console.log(' -- -' + 'updSyntheseHoraire ' + stats.iTotFree + ' sur ' + stats.iTot + ' libres   (salles/box/autres)' + stats.iNbSalle + '/' + stats.iNbBox + '/' + stats.iNbAutre);

    }
    ,

    /*
     *      Défini un créneau d'1 heure à partie de 3 tranches 1/2h.
     *
     *      @param  a,b,c (3 tranches  1/2h)
     *      @return  meeting
     */
    getOneMeeting: function (a, b, c) {
        var meeting = {};

        meeting.horaire = moment(a.horaire).toDate();
        meeting.debut = moment(a.horaire).toDate();
        meeting.statut = "busy";


        if (a.statut == "free" && b.statut == "free") { // cas standard
            meeting.statut = "free";
            return meeting;
        }


        if (c && b.statut == "free" && c.statut == "free") { // cas standard
            meeting.statut = "free";
            meeting.debut = moment(b.horaire).toDate();
            ;
            return meeting;
        }

        return meeting;
    }
    ,
    /*
     *      retourne le prochain jour ouvré
     *
     *      @param day
     *      @return  nextDay
     */
    nextWeekDay: function (day, sens) {
        sens = sens || 1;
        var nextDay = new Date(day);
        nextDay.setDate(nextDay.getDate() + 1 * sens);
        var n = nextDay.getDay();
        while (n == 0 || n == 6) {
            nextDay.setDate(nextDay.getDate() + 1 * sens);
            n = nextDay.getDay();
        }
        return nextDay;
    }
    ,
    /*
     *      retourne le prochain jour ouvré
     *
     *      @param day
     *      @return  nextDay
     */
    decodeRoomName: function (inName) {

        var roomName = inName;
        // tous les cas possibles ..
        //Salle TEC V-5-17-Catalpa, 8+2p --> le plus fréquent
        //Salle TEC R-4-18 Vésuve, 10p
        //Box TEC V-5-08, 4p -> cas standard ..
        //Box TEC V-0-Box 2, 4p (Espace Affaires)
        roomName = roomName.replace(/-Box/g, "-00");
        //Salle visio TEC J-3-04 Box 2, 3p
        // salle TEC J2-03 ADRAR, 10p
        roomName = roomName.replace(/TEC J2/g, "TEC J-2");

        var decodeName = {};
        decodeName.fullname = roomName;


        decodeName.categorie = 'autre';  // salle / box / autre
        if (roomName.match(/salle/i)) {
            decodeName.categorie = 'salle';
        }
        if (roomName.match(/box/i)) {
            decodeName.categorie = 'box';
        }
        if (roomName.match(/maison des experts/i)) {
            decodeName.categorie = 'autre';
        }
        if (roomName.match(/victoria/i)) {
            decodeName.categorie = 'autre';
        }
        if (roomName.match(/Fuji Yama/i)) {
            decodeName.categorie = 'autre';
        }
        decodeName.visio = false;
        if (roomName.match(/visio/i)) {
            decodeName.visio = true;
        }


        // objectif : on décode la place V-0-09  puis on découpe avec la place ...
        var res = decodeName.fullname.split("-"); //
        var nbParts = res.length;
        decodeName.aile = res[0].substr(res[0].length-1); // dernier caractère ...
        decodeName.fullType = res[0].substr(0, res[0].length-1); // salle visio ...
        decodeName.etage = res[1];
        if (res.length >  3){
            decodeName.alveole = res[2];
            var suff = '';
            if ( !(typeof res[4] === 'undefined')) {
                suff = '-' + res[4]; // cas d'un - suppl comme saint-germain ...
            }
            decodeName.shortName = res[3] + suff;
        }else{
            // on recheche l'espace ...
            var n = res[2].search(" ");
            decodeName.alveole = res[2].substring(0, n-1);
            decodeName.shortName = res[2].substring(n+1, res[2].length);
        }


        if (decodeName.alveole.length == 1 ){ decodeName.alveole = "0" + decodeName.alveole ;} // alveole sur 2 digits
        decodeName.place = decodeName.aile + "-" + decodeName.etage + "-" + decodeName.alveole;
        decodeName.shortName = decodeName.shortName.replace(new RegExp('\\(.*\\)', 'gi'), ''); // suppression "(...)"
        decodeName.shortName = decodeName.shortName.replace(/box/i, '')
        decodeName.shortName = decodeName.shortName.trim();
        if (decodeName.categorie == "box") {
            decodeName.infoName = "Box " + decodeName.shortName;
        }else{
            decodeName.infoName = decodeName.shortName;
        }
        if (decodeName.visio){
            decodeName.infoName =  decodeName.infoName  + ' (visio)'
        }

        switch (decodeName.aile) {
            case "V":
                decodeName.idAile = 1; break;
            case "J":
                decodeName.idAile = 2; break;
            case "B":
                decodeName.idAile = 3;break;
            case "R":
                decodeName.idAile = 4;break;
            default :
                decodeName.idAile = 0;break;
        }

        return decodeName;
    }
}
