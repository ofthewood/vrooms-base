// http://stackoverflow.com/questions/16534363/call-functions-from-separate-files-with-meteor
if (moment.fn.nextWeekDay==null) moment.fn.nextWeekDay=function(sens){
    var sens = sens || 1;
    this.add(sens, 'day');
    var weekendDays = [0,6];
    while (weekendDays.indexOf(this.day()) != -1) {
        this.add(sens, 'day');
    }
    return this;
};


/**
 * @namespace Agenda
 * @summary
 *          Rooms :  update ou insert systématique depuis  api REST
 *           Agenda.meetingsUpdate(meetings, this.bodyParams.name, this.bodyParams.mail);
 *                  on met à jour la table meetings
 *                  On met à jour les timesSlots si modifier.
 */



Agenda = {};
var iUpdateCount = 0;

/**
 *  return next & previous  day and flag
 * @param dayProcessed au format "YYYY-MM-DD"
 * @returns {Template.timeslotsDay}
 */
Agenda.daysContext = function(dayProcessed){
    var dayContext = {} ;
    dayContext.dayProcessed         = dayProcessed;
    dayContext.formatedDayProcessed =  moment(dayProcessed, "YYYY-MM-DD").format('dddd LL');
    dayContext.previousDay          = moment(dayProcessed, "YYYY-MM-DD").nextWeekDay(-1).format("YYYY-MM-DD");
    dayContext.nextDay              = moment(dayProcessed, "YYYY-MM-DD").nextWeekDay().format("YYYY-MM-DD");
    var ListMeetingDay = Agenda.ListMeetingDay();
    var firstday = ListMeetingDay[0];
    var lastday = ListMeetingDay[ListMeetingDay.length - 1];
    dayContext.isFirstDay = (firstday.format('YYYY-MM-DD') == dayProcessed) ? true : false;
    dayContext.isNotFirstDay = ! dayContext.isFirstDay;
    dayContext.isLastDay = (lastday.format('YYYY-MM-DD') == dayProcessed) ? true : false;
    dayContext.isNotLastDay = ! dayContext.isLastDay;
    return dayContext;
};

/**
 * @summary transform outlook data ( busy / free each 30mn )
 *          in a meeting list by hour.
 * @param agenda
 */
Agenda.getMeetingsFromAgenda = function (agenda) {
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
            var meeting = Agenda.getOneMeeting(a, b, c);
            meetings.push(meeting);
        }
    }
    return meetings;
};
/**
 * @summary  On UI, manage user action on agenda
 * @param horaire
 * @param iNb
 * @param categorie
 */

Agenda.flipFlapFilter = function (horaire, iNb, categorie) {
    var filter = {};
    filter.categorie = categorie;
    filter.horaire = horaire;
    var isFilter = Filters.findOne({horaire: filter.horaire, categorie: filter.categorie});

    if (isFilter || iNb == 0 ) {
        Filters.remove(isFilter._id); // existait on le supprime
    } else {
        // n existait pas .. on supprime les autres sur le même créneaux avant d'insérer..
        Filters.remove({horaire: filter.horaire});
        Filters.insert(filter);
    }
    Session.set('flipFlapFilter', moment().toDate().getTime() );
};

/**
 * @summary  get next week day.
 * @param day
 * @param sens
 * @returns {Date}
 */
Agenda.nextWeekDay = function (day, sens) {
    sens = sens || 1;
    var nextDay = new Date(day);
    nextDay.setDate(nextDay.getDate() + 1 * sens);
    var n = nextDay.getDay();
    while (n == 0 || n == 6) {
        nextDay.setDate(nextDay.getDate() + 1 * sens);
        n = nextDay.getDay();
    }
    return nextDay;
};



/**
 * @summary   get list day meeting
 * @returns {Date}
 * @constructor
 */
Agenda.ListMeetingDay = function () {
    var lastFinishedDay =  moment().add(-1, 'day');
    if (moment().hour() >=18 ) { lastFinishedDay =  moment()};
    var days = [] ;
    _(6).times(function (n) {
        lastFinishedDay.nextWeekDay();
        days.push(moment(lastFinishedDay)); // cloner
    });
    return days;

};
/**
 * @summary   get first day meeting ( pivot hour to 18H  )
 * @returns {Date}
 * @constructor
 */
Agenda.currentMeetingDay = function () {
    var currentMeetingDay = moment();
    if (moment().hour() < 18 ) {
        currentMeetingDay.subtract(1, 'day')
    }
    return currentMeetingDay.nextWeekDay();


};

/**
 *   @summary  verify rooms updatedAt
 */
Agenda.checkRooms = function () {

    // on liste les salles qui n'ont pas été mise à jour dans le dernier run
    // ( updatedAt  de plus de 7 minutes )
    notUpdatedRooms = Rooms.find({updatedAt: {$lt: moment().subtract(7 * 60, 'seconds').toDate()}}).fetch();
    console.log('Rooms  not update for 7 minutes ', notUpdatedRooms.length);
    _.each(notUpdatedRooms, function (room) {
        var now = moment();
        var then = moment(room.updatedAt);
        console.log(' - Depuis ', now.diff(then,'minutes'), ' min ', room.name, ' (', then.format('ddd LLL') ,')');
    });

};

/**
 *   @summary  update lastupdate
 */
Agenda.updateLastupdate = function (){

    // si le dernier update date de plus d'une Minute
    // ca veut dire qu'on commence une nouvelle vague de maj
    //  --> on flush iUpdateCount
    // -->
    if (moment().subtract(60, 'seconds').toDate()>  LastUpdate.findOne({}).lastdate){
        console.log('Nb rooms updated(last Run): ', iUpdateCount)   ;
        iUpdateCount = 0;
        Agenda.checkRooms();

    }
    iUpdateCount ++;

    // si plus de 10s on met à jour .
    var lastDate  = moment().toDate();
    var pivotDate = moment().subtract(10, 'seconds').toDate();
    LastUpdate.update({lastdate: {$lt: pivotDate}},{lastdate:lastDate});
};


/**
 * @summary     update Rooms
 *              updatedAt : tjs maj
 *              modifiedAt : seulement si chgt data
 * @param meetings
 * @param name
 * @param mail
 */

Agenda.roomsUpdate = function (roomData) {
    var salle = Rooms.findOne({mail: roomData.mail});
    roomData.updatedAt = moment().toDate(); //
    if (salle) {
        if (JSON.stringify(salle.agenda) != JSON.stringify(roomData.agenda)) {
            roomData.createdAt = salle.createdAt;
            roomData.modifiedAt = moment().toDate();
            Rooms.update(salle._id, roomData);
        }else{
            Rooms.update(salle._id, {$set: {updatedAt: roomData.updatedAt}});
        }
    } else {
        console.log("Insert->" + roomData.name);
        roomData.createdAt = moment().toDate();
        roomData.modifiedAt = moment().toDate();
        var id = Rooms.insert(roomData);
    }
};

/**
 * @summary  update meetings
 * @param meetings
 * @param name
 * @param mail
 */

Agenda.meetingsUpdate = function (meetings, name, mail) {
    var iUpdate = 0;
    var iInsert = 0;
    var iNothing = 0;
    try {
        var decodeName = Agenda.decodeRoomName(name);
    }
    catch(err) {
        console.log('--Erreur decode: ' + name);
        return ;
    }
    var isModified;

    for (var i in meetings) {

        meetings[i].name = decodeName.name;
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
            Agenda.updSyntheseHoraire(meetings[i].horaire);
        }



        //return ;
    } // fin boucle

    var iTotal = iNothing + iUpdate + iInsert;
    console.log(moment().format('YYYYMMDD HH:mm:ss') + ' ' + name.substring(0, 25) + ' ' + ' Total(' + iTotal + ') unchanged (' + iNothing + ') updated(' + iUpdate + ') inserted(' + iInsert + ') ');


};


/*
 *      recalcule la synthèse  par crénau horaire et met à jour ...
 *
 *      @param  meeting  //  free , oldMeetings //free ..
 *      @return  timeslotstat
 */
Agenda.updSyntheseHoraire=  function (horaire) {
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

};

/**
 * @summary Défini un créneau d'1 heure à partie de 3 tranches 1/2h.
 * @param a
 * @param b
 * @param c
 * @returns {{}}
 */
Agenda.getOneMeeting =  function (a, b, c) {
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
};

/**
 * @summary normalize and decode room name.
 * @param inName
 * @returns {{}}
 */

Agenda.decodeRoomName = function (inName) {

    var roomName = inName;
    roomName = roomName.replace(/Ressource /g, '');
    roomName = roomName.replace(/Salle visio TEC J-3-04 Box /g, 'Box visio TEC J-3-04 ');
    roomName = roomName.replace(/Salle visio TEC B-2-21 Box/g, 'Box visio TEC B-2-21');

    var decodeName = {};
    decodeName.name = inName;
    decodeName.workname = roomName;

    var Categories = [];
    Categories.push({pattern:'Salle TEC Créativité ',   categ: 'autre',   visio: false, addInfo:'Créativité '});
    Categories.push({pattern:'Salle TEC CODG ',         categ: 'autre',   visio: false, addInfo:'Salle CODG '});
    Categories.push({pattern:'Salle visio TEC ',        categ: 'salle', visio: true});
    Categories.push({pattern:'Box visio TEC ',          categ: 'box', visio: true});
    Categories.push({pattern:'Box TEC ',                categ: 'box',   visio: false});
    Categories.push({pattern:'Salle TEC ',              categ: 'salle', visio: false});

    var Exceptions = [];
    Exceptions.push({pattern:'victoria',            categ: 'autre'});
    Exceptions.push({pattern:'maison des experts',  categ: 'autre'});
    Exceptions.push({pattern:'Fuji Yama',           categ: 'autre'});

    function setCategorie(element, index, array) {
        if (decodeName.workname.match(new RegExp(element.pattern,'i'))) {
            decodeName.workname =   decodeName.workname.replace(new RegExp(element.pattern,'i'),'');
            decodeName.categorie =  element.categ;
            decodeName.visio =      element.visio;
            if (element.addInfo){decodeName.addInfo = element.addInfo}
        }
    }

    function setExceptions  (element, index, array) {
        if (decodeName.workname.match(new RegExp(element.pattern,'i'))) {
            decodeName.categorie =  element.categ;
            if( element.visio){decodeName.visio = element.visio;}
        }
    }

    Categories.forEach(setCategorie);
    Exceptions.forEach(setExceptions);

    // is  ok ?
    if (  ! decodeName.categorie){
        console.log(inName + ' ' + roomName + '-------- pas de catégorie !!! ----');
    }

    // objectif : on décode la place V-0-09  puis on découpe avec la place ...
    // les pb de formatage. ...
    decodeName.workname = decodeName.workname.replace(/-Box/g, "-00");
    decodeName.workname = decodeName.workname.replace(/V 2/g, "V-2");
    decodeName.workname = decodeName.workname.replace(/V-6,/g, "V-6-00");
    decodeName.workname = decodeName.workname.replace(/J2/g, "J-2");
    decodeName.workname = decodeName.workname.replace(/B-1- S/g, "B-1-00 S");
    decodeName.workname = decodeName.workname.replace(/B-1-Se/g, "B-1-00 Se");
    decodeName.workname = decodeName.workname.replace(/B-1-Ch/g, "B-1-00 Ch");
    decodeName.workname = decodeName.workname.replace(/B-1-Ga/g, "B-1-00 Ga");
    decodeName.workname = decodeName.workname.replace(/B-1-Lo/g, "B-1-00 Lo");
    decodeName.workname = decodeName.workname.replace(/B-1-Rh/g, "B-1-00 Rh");
    decodeName.workname = decodeName.workname.replace(/B-1-So/g, "B-1-00 So");

    decodeName.place = decodeName.workname.substring(0,6); //
    var res = decodeName.place.split("-"); //
    if(res.length == 3){
        decodeName.aile     = res[0];
        decodeName.etage    = res[1];
        decodeName.alveole  = res[1];
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
    }else{
        decodeName.idAile = 0;
        console.log('erreur localisation... ' + decodeName.place);
    }

    decodeName.shortName = decodeName.workname.slice(7);
    if (decodeName.addInfo) {
        decodeName.shortName = decodeName.addInfo + decodeName.shortName;
    }
    decodeName.shortName = decodeName.shortName.replace(new RegExp('\\(.*\\)', 'gi'), ''); // suppression "(...)"
    decodeName.shortName = decodeName.shortName.replace(/box/i, '')
    decodeName.shortName = decodeName.shortName.replace(/^,/i, '')
    decodeName.shortName = decodeName.shortName.trim();
    if (decodeName.categorie == "box") {
        decodeName.infoName = "Box " + decodeName.shortName;
    }else{
        decodeName.infoName = decodeName.shortName;
    }
    if (decodeName.visio){
        decodeName.infoName =  decodeName.infoName  + ' (visio)'
    }
    //console.log( inName + '|' +  decodeName.place + '|' + decodeName.infoName);

    return decodeName;
};



