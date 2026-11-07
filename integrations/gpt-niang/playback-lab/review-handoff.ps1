function Test-ReviewDisplayTicket($Ticket,[int]$ExpectedCandidatePid,[string]$ExpectedKey,[long]$RequestedAt){
 try{
  return [bool]($Ticket.pid-eq $ExpectedCandidatePid -and $Ticket.visible-eq $true -and $Ticket.leaseOwned-eq $true -and $Ticket.keySha256-eq $ExpectedKey -and [long]$Ticket.at-ge $RequestedAt)
 }catch{return $false}
}
