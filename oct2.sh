#!/bin/bash
apikey="c0d38787-c420-4bd3-ba94-c4b3477ee9bb"
headers=(-H 'accept: */*' -H 'accept-language: zh-HK,zh;q=0.9' -H 'dnt: 1' -H 'origin: https://cny.octopus.com.hk' -H 'priority: u=1, i' -H 'referer: https://cny.octopus.com.hk/' -H 'sec-ch-ua: "Not A(Brand";v="8", "Chromium";v="132", "Google Chrome";v="132"' -H 'sec-ch-ua-mobile: ?1' -H 'sec-ch-ua-platform: "Android"' -H 'sec-fetch-dest: empty' -H 'sec-fetch-mode: cors' -H 'sec-fetch-site: same-site' -H 'user-agent: Mozilla/5.0 (Linux; Android 13; SM-G981B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36')

debuglog="$(date "+%Y%m%d%H%M%S%3N").log"
tmpdir="$(pwd)"
tmp_token="$(mktemp -p "$tmpdir")"
tmp_sessionid="$(mktemp -p "$tmpdir")"

function log() {
    echo -e "$(date +"%F %T.%N") $1" >> "$debuglog"
}

function cleanup() {
    log "cleaning up"
    rm -f "$tmp_token" "$tmp_sessionid"
    echo "DONE"
}

function check_quota() {
    local res="$1"
    local body="$2"
    
    grep "HTTP\/1\.1 400" "$res" >/dev/null 2>&1
    if [ $? -eq 0 ]; then
        if [ "$(echo "$body" | jq -r ".message")" = "No available prizes" ]; then
            log "No available prizes"
            return 1
        fi
    fi
    return 0
}

function check_unauth() {
    local res="$1"
    grep "HTTP\/1\.1 401" "$res" >/dev/null 2>&1
    if [ $? -eq 0 ]; then
        log "Unauthorize"
        return 1
    fi
    return 0
}

function check_rate_limit() {
    local res="$1"
    local body="$2"
    
    grep "HTTP\/1\.1 429" "$res" >/dev/null 2>&1
    if [ $? -eq 0 ]; then
        sec="$(echo "$body" | jq -r ".message" | sed -e "s/^.*in \([0-9]\+\) seconds.*$/\1/g")"
        log "Rate limit: $sec"
        echo "$sec"
        return 1
    fi
    return 0
}

function check_err() {
    local res="$1"
    
    grep "HTTP\/1\.1 5[0-9]{2}" "$res" >/dev/null 2>&1
    if [ $? -eq 0 ]; then
        log "Server error"
        return 1
    fi
    
    grep "HTTP\/1\.1 4[0-9]{2}" "$res" >/dev/null 2>&1
    if [ $? -eq 0 ]; then
        log "Client error"
        return 1
    fi
    return 0
}

function get_token() {
    local val=""
    while [ "$val" = "" -o "$val" = "null" ]; do
        [ -f stop.txt ] && log "STOP get token" && return 1
    
        log "Getting token"
        outbody="$(curl -v 'https://cnyapi.octopus.com.hk/api/tc/draw/token' --compressed -H "ApiKey: $apikey" "${headers[@]}" 2>"$tmp_token")"
        log "\n$(cat $tmp_token)\n"
        log "\n${outbody}\n"
        
        check_quota "$tmp_token" "$outbody"
        [ $? -eq 1 ] && return 1
        
        check_unauth "$tmp_token"
        [ $? -eq 1 ] && return 2
        
        local sec="$(check_rate_limit "$tmp_token" "$outbody")"
        if [ $? -eq 1 ]; then
            sleep $sec
            continue
        fi
        
        check_err "$tmp_token"
        if [ $? -eq 1 ]; then
            continue            
        fi
        
        val="$(echo "$outbody" | jq -r ".prizeDrawToken")"
        if [ "$val" = "" -o "$val" = "null" ]; then
            log "Invalid token"
        fi
    done
    echo "$val"
}

function get_sessionid() {
    local prizedrawtoken="$token"
    local val=""
    while [ "$val" = "" -o "$val" = "null" ]; do
        [ -f stop.txt ] && log "STOP get sessionId" && return 1
        
        log "Getting sessionid with token $prizedrawtoken"
        outbody="$(curl -v 'https://cnyapi.octopus.com.hk/api/tc/draw/start?location=app' --compressed -X POST -H "ApiKey: $apikey" -H "prizeDrawToken: $prizedrawtoken" -H 'content-length: 0' "${headers[@]}" 2>"$tmp_sessionid")"
        log "\n$(cat $tmp_sessionid)\n"
        log "\n${outbody}\n"
        
        check_quota "$tmp_sessionid" "$outbody"
        [ $? -eq 1 ] && return 2
        
        check_unauth "$tmp_sessionid"
        [ $? -eq 1 ] && return 2
        
        local sec="$(check_rate_limit "$tmp_sessionid" "$outbody")"
        if [ $? -eq 1 ]; then
            sleep $sec
            continue
        fi
        
        check_err "$tmp_sessionid"
        if [ $? -eq 1 ]; then
            continue            
        fi
        
        val="$(echo "$outbody" | jq -r ".drawEvent.sessionId")"
        if [ "$val" = "" -o "$val" = "null" ]; then
            log "Invalid sessionId"
        fi
    done
    echo "$val"
}

function main() {
    token="$(get_token)"
    ret="$?"
    [ $ret -eq 1 ] && cleanup && exit 1
    if [ $ret -eq 2 ]; then
        log "Run again"
        main
    else
        sessionId="$(get_sessionid)"
        ret="$?"
        [ $ret -eq 1 ] && cleanup && exit 1
        if [ $ret -eq 2 ]; then
            log "Run again"
            sleep 10
            main
        else
            link="https://app.octopus.com.hk/cny2025?laiseeId=$sessionId"
            echo -e "\n$link\n"
            echo -e "\n$link\n" >> octopus-laisee.txt
        fi
    fi
}

main