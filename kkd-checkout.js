// ==UserScript==
// @name         kkday autofill
// @namespace    http://www.kkday.com/
// @version      2024-08-14
// @description  kkday autofill
// @author       You
// @match        https://www.kkday.com/zh-hk/booking/step1/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=kkday.com
// @require      https://code.jquery.com/jquery-3.7.1.min.js
// @grant        none
// ==/UserScript==

var $ = jQuery.noConflict(true);

var kkdayptsCompleted = false;
var paymentSectionCompleted = false;

function useKKdayPoints() {
    var cbKKdayPts = $('div.kkpoint-cash-board div.point-checked.checkbox');
    var kkdayPtsIcon = $('div.point-checkbox span.point-num img.ic-point');

    if ($(cbKKdayPts).length == 0 || $(kkdayPtsIcon).length == 0) {
        console.log('Waiting for kkday points section');
        setTimeout (useKKdayPoints, 500);
    } else if (!$(cbKKdayPts).hasClass('checked')) {
        console.log('Selecting kkday points');
        $(cbKKdayPts).click();
        if ($(cbKKdayPts).hasClass('checked')) {
            console.log('Selected kkday points');
            kkdayptsCompleted = true;
        } else {
            setTimeout(useKKdayPoints, 500);
        }
    } else {
        console.log('Selected kkday points');
        kkdayptsCompleted = true;
    }
}

function choosePayment() {
    var radioPayMe = $("ul.payment-list span:contains('PayMe')");

    if ($(radioPayMe).length == 0) {
        console.log('Waiting for payment section');
        setTimeout(choosePayment, 500);
    } else {
        $(radioPayMe).click();
        console.log('Selected PayMe');
        paymentSectionCompleted = true;
    }
}

function waitContact() {
    var ipFirstName = $('input[name="contactFirstname"]');
    var ipLastName = $('input[name="contactLastname"]');
    var ipEmail = $('input[name="contactEmail"]');

    if ($(ipFirstName).length == 0 || $(ipLastName).length == 0 || $(ipEmail).length == 0 || $(ipFirstName).val() == "" || (ipLastName).val() == "" || $(ipEmail).val() == "") {
        console.log('Waiting for contact info');
        setTimeout(waitContact, 500);
    } else if (!kkdayptsCompleted || !paymentSectionCompleted) {
        console.log('Waiting for kkdaypoints and payment sections');
        setTimeout(waitContact, 500);
    } else {
        $(window).scrollTop(0);
        console.log('Ready to pay!');
    }
}

function processTraveler() {
    var ddlTravelerQty = $('div[name="travelerQty0"]');

    if ($(ddlTravelerQty).length > 0 ) {
        $(ddlTravelerQty).click();
        $('div#travelerInformation div.kk-select-dropdown div.kk-select-option__content:contains("3")').click();
    }
}

$(document).ready(function () {
    console.log("Document ready");
    useKKdayPoints();
    choosePayment();
    waitContact();
    processTraveler();
    console.log('Document end');
});
