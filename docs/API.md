# MaidCentral API catalog

Generated 2026-11-02T15:55:32.675Z by `npm run catalog`. Do not edit by hand.

Shapes only: every value is replaced by its type, ids by `:id`, the company subdomain by `{tenant}`.
No names, emails, phones, addresses, notes, pay rates or search text.

## Coverage

| Capability | Where | Official API (read / write) | Portal (read / write) |
| --- | --- | --- | --- |
| Sign-in and session | **both** | 0 / 1 | 3 / 3 |
| Clients and homes | **portal only** | 0 / 0 | 15 / 1 |
| Leads and quotes | **both** | 2 / 4 | 5 / 2 |
| Jobs | **portal only** | 0 / 0 | 10 / 5 |
| Schedule and dispatch | **both** | 1 / 0 | 10 / 3 |
| Teams | **both** | 1 / 0 | 8 / 0 |
| Employees | **portal only** | 0 / 0 | 11 / 3 |
| Payroll and time | **not seen** | 0 / 0 | 0 / 0 |
| Invoices and payments | **not seen** | 0 / 0 | 0 / 0 |
| Pricing and services | **official API** | 5 / 1 | 0 / 0 |
| Notes and messages | **both** | 3 / 1 | 4 / 3 |
| Reports and dashboard | **portal only** | 0 / 0 | 5 / 2 |
| Settings and lookups | **both** | 4 / 0 | 2 / 2 |

## 1. Official API

Docs: https://support.maidcentral.com/apidocs  
Production: `https://api.maidcentral.com` · Sandbox: `https://api.maidcentral.net`  
Auth: POST /token (form-encoded) with username and password (grant_type=password), or refresh_token (grant_type=refresh_token); then Authorization: Bearer <token>. Credentials come from an API User (Company > Settings > General > Integrations > API Users).

> Docs read end to end on 2026-11-02: 23 endpoints including /token, all under /api/Lead and /api/Note. The API covers the online-booking funnel (leads, quotes, pricing, availability, booking) plus notes and a few lookups. It has no endpoints for existing clients, jobs, the schedule, employees, payroll or invoices. Not probed yet (no API user in the session).

| Method | Path | Purpose | Verified |
| --- | --- | --- | --- |
| GET | `/api/Lead/Availability` | Available job dates for a scope group (hours or amount required) | no |
| GET | `/api/Lead/BillingTerms` | Billing terms (lookup) | no |
| POST | `/api/Lead/BookQuote` | Book a quote (turns it into scheduled service). Card details only as a CardConnect iFrame token; Stripe and Authorize.Net not supported | no |
| POST | `/api/Lead/CalculatePrice` | Calculate a price without creating a lead | no |
| POST | `/api/Lead/CreateOrUpdate` | Create or update a lead (contact details, postal code, source, tags) | no |
| POST | `/api/Lead/CreateOrUpdateQuote` | Create or update a quote for a lead (home, scopes, answers, rate modifications) | no |
| GET | `/api/Lead/CustomerSources` | Customer sources (lookup) | no |
| GET | `/api/Lead/Lead` | Get a lead | no |
| GET | `/api/Lead/PostalCodes` | Serviceable postal codes by home zone | no |
| GET | `/api/Lead/Questions` | Booking and pricing questions for one or more scopes | no |
| GET | `/api/Lead/Quote` | Get a quote | no |
| GET | `/api/Lead/RateModifications` | Rate modifications (extras, add-ons) for a scope group | no |
| GET | `/api/Lead/ScopeFrequencies` | Frequency options for a scope | no |
| GET | `/api/Lead/ScopeGroups` | Scope groups (service categories), with their scopes and frequencies | no |
| GET | `/api/Lead/Scopes` | Scopes (services) in a scope group | no |
| GET | `/api/Lead/Tags` | Tags with their categories (lookup) | no |
| GET | `/api/Lead/Teams` | Teams (lookup) | no |
| POST | `/api/Lead/Utm` | Attach UTM data to a lead or quote | no |
| GET | `/api/Note/CommunicationDirections` | Note communication directions (lookup) | no |
| POST | `/api/Note/Create` | Create a note for a customer, quote or employee | no |
| GET | `/api/Note/EntityTypes` | Note entity types (lookup) | no |
| GET | `/api/Note/Types` | Note types (lookup) | no |
| POST | `/token` | Get a bearer token for the API user (grant_type=password) or refresh it (grant_type=refresh_token) | no |

## 2. Admin portal

### How the portal talks to its backend

- Auth on API calls: cookies only (no Authorization header seen)
- Anti-forgery / CSRF headers: none seen
- Cookies (names only): `__RequestVerificationToken` httpOnly session, `TwoFactorRememberBrowser` httpOnly, `ASP.NET_SessionId` httpOnly session, `.AspNet.ApplicationCookie` httpOnly
- Browser storage keys: localStorage (none); sessionStorage (none)
- Login requests: `GET {tenant}.maidcentral.com/Account/Login`, `POST {tenant}.maidcentral.com/Account/Login`, `GET {tenant}.maidcentral.com/Account/SendCode`, `POST {tenant}.maidcentral.com/Account/SendCode`, `GET {tenant}.maidcentral.com/Account/VerifyCode`, `POST {tenant}.maidcentral.com/Account/VerifyCode`

### Pages

#### `/`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 5 table(s)
- `GET {tenant}.maidcentral.com/Customer/EditTicket/`
- `GET {tenant}.maidcentral.com/Home/CustomerServiceRequests/`
- `GET {tenant}.maidcentral.com/Home/GetChartData/`
- `GET {tenant}.maidcentral.com/Home/NewCustomersWidget`
- `GET {tenant}.maidcentral.com/Home/OpenContactTickets`
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `GET {tenant}.maidcentral.com/img/remove-icon-small.png (blocked: unsafe-get)`
- `GET {tenant}.maidcentral.com/report/bidata`
- `POST eastus-5.in.applicationinsights.azure.com//v2/track (blocked: write)`

#### `/Home`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 5 table(s)
- `GET {tenant}.maidcentral.com/Customer/EditTicket/`
- `GET {tenant}.maidcentral.com/Home/CustomerServiceRequests/`
- `GET {tenant}.maidcentral.com/Home/GetChartData/`
- `GET {tenant}.maidcentral.com/Home/NewCustomersWidget`
- `GET {tenant}.maidcentral.com/Home/OpenContactTickets`
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `GET {tenant}.maidcentral.com/img/remove-icon-small.png (blocked: unsafe-get)`
- `GET {tenant}.maidcentral.com/report/bidata`
- `POST eastus-5.in.applicationinsights.azure.com//v2/track (blocked: write)`

#### `/Home/SalesDashboard`

- Rendering: server-rendered + XHR · jquery 1.11.2
- `GET {tenant}.maidcentral.com/Home/SalesExternalFormQuotes`
- `GET {tenant}.maidcentral.com/Home/SalesOpenNotes`
- `GET {tenant}.maidcentral.com/Home/SalesQuotesAction`
- `GET {tenant}.maidcentral.com/Home/SalesServiceRequests`
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `POST eastus-5.in.applicationinsights.azure.com//v2/track (blocked: write)`

#### `/Estimate/SalesPipeline?=:date`

- Rendering: server-rendered + XHR · jquery 1.11.2, signalR
- `GET {tenant}.maidcentral.com/Estimate/GetOnlineLeads`
- `POST {tenant}.maidcentral.com/Estimate/GetPipelineData (blocked: write)`
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `GET {tenant}.maidcentral.com/img/remove-icon-small.png (blocked: unsafe-get)`
- `GET {tenant}.maidcentral.com/signalr/negotiate`
- `GET {tenant}.maidcentral.com/signalr/start`
- `POST eastus-5.in.applicationinsights.azure.com//v2/track (blocked: write)`
- Form `GET (same page)`: (no fields)

#### `/Communication`

- Rendering: server-rendered + XHR · jquery 1.11.2
- `POST {tenant}.maidcentral.com/Communication/GetMessageThread (blocked: write)`
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `POST eastus-5.in.applicationinsights.azure.com//v2/track (blocked: write)`

#### `/Employee/Dashboard`

- Rendering: server-rendered + XHR · jquery 1.11.2
- `GET {tenant}.maidcentral.com/Employee/Worksheets`
- `GET {tenant}.maidcentral.com/Job/CheckNextJobNotificationOnWay`
- `POST {tenant}.maidcentral.com/Time/GetAllTimeChangeRequestsForEmployee (blocked: write)`
- `POST eastus-5.in.applicationinsights.azure.com//v2/track (blocked: write)`
- `GET maps.googleapis.com/maps/api/mapsjs/gen_204`
- Form `POST /Customer/Search`: `Tags:text`

#### `/Dashboard/Index/:id`

- Rendering: server-rendered + XHR · jquery 1.11.2, signalR · 4 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `POST eastus-5.in.applicationinsights.azure.com//v2/track (blocked: write)`

#### `/Employee/Create`

- Rendering: server-rendered + XHR · jquery 1.11.2 · anti-forgery field
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `POST eastus-5.in.applicationinsights.azure.com//v2/track (blocked: write)`
- `GET maps.googleapis.com/maps/api/mapsjs/gen_204`
- Form `POST /Employee/Create`: `__RequestVerificationToken:hidden`, `Role:hidden`, `Prefix:text`, `FirstName:text`, `MiddleName:text`, `LastName:text`, `HireDate:text`, `DriversLicenseNumber:text`, `DriversLicenseNumberState:text`, `AddScheduleTag:checkbox`, `AddScheduleTag:hidden`, `EmergencyContactName:text`, `EmergencyContactPhone:text`, `FirstContactTypeId:select-one`, `FirstContactInfo:text`, `Email:email`, `RolesSelected:checkbox`, `mycustomfield:text`, `MailingAddress:id:text`, `MailingCountry:hidden`, `MailingCity:text`, `MailingRegion:text`, `MailingPostalCode:text`, `PhysicalSameAsMailing:checkbox`, `PhysicalSameAsMailing:hidden`, `myothercustomfield:text`, `PhysicalAddress:id:text`, `PhysicalCountry:hidden`, `PhysicalCity:text`, `PhysicalRegion:text`, `PhysicalPostalCode:text`, `FederalTaxCredits:text`, `StateTaxCredits:text`, `MaritalStatusId:select-one`, `Withholdings:text`, `DateOfBirth:text`, `ServiceCompanyGroupPolicyId:select-one`, `Salary:text`, `HourlyRate:text`, `MinimumWageRate:text`, `MaxHourlyRate:text`

#### `/Employee`

- Rendering: server-rendered + XHR · jquery 1.11.2 · anti-forgery field · 1 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `POST eastus-5.in.applicationinsights.azure.com//v2/track (blocked: write)`
- Form `GET /Employee`: `TagsSelected:checkbox`, `SkillsSelected:checkbox`, `ShowTerminated:checkbox`, `ShowTerminated:hidden`
- Form `POST /Employee/LockEmployeeAccount`: `__RequestVerificationToken:hidden`

#### `/Employee/Time#monitor-tab`

- Rendering: server-rendered + XHR · knockout, jquery 1.11.2, kendo · 20 table(s)
- `GET {tenant}.maidcentral.com/Employee/EmployeeMonitorData`
- `GET {tenant}.maidcentral.com/Employee/EmployeeMonitorTeams`
- `POST {tenant}.maidcentral.com/Event/Events (blocked: write)`
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `POST {tenant}.maidcentral.com/report/getTimeChangeRequests (blocked: write)`
- `POST eastus-5.in.applicationinsights.azure.com//v2/track (blocked: write)`
- `GET maps.googleapis.com/maps/api/mapsjs/gen_204`
- Form `POST /Time/ExportTimeClockData`: `StartDate:text`, `EndDate:text`, `ExportTypes:checkbox`

#### `/Company/BroadcastMessage`

- Rendering: server-rendered + XHR · jquery 1.11.2 · anti-forgery field
- `POST {tenant}.maidcentral.com/Company/BroadcastMessage (blocked: write)`
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `GET {tenant}.maidcentral.com/plugins/tinymce/plugins/importcss/plugin.min.js (blocked: unsafe-get)`
- `GET {tenant}.maidcentral.com/ProviderStatus/Current`
- `POST eastus-5.in.applicationinsights.azure.com//v2/track (blocked: write)`
- Form `POST /Company/BroadcastMessage`: `__RequestVerificationToken:hidden`, `ConfirmedToSend:hidden`, `ServiceCompaniesSelected[:id]:hidden`, `Medium:radio`, `Subject:text`, `From:email`, `Message:textarea`

#### `/Schedule`

- Rendering: server-rendered + XHR · knockout, jquery 1.11.2, kendo · 5 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `GET {tenant}.maidcentral.com/img/remove-icon-small.png (blocked: unsafe-get)`
- `POST {tenant}.maidcentral.com/Job/CustomerEmployeeFlags/ (blocked: write)`
- `POST {tenant}.maidcentral.com/Schedule/AbsentEmployees/ (blocked: write)`
- `GET {tenant}.maidcentral.com/Schedule/GetSchedulerItemDetails`
- `GET {tenant}.maidcentral.com/Schedule/Read`
- `GET {tenant}.maidcentral.com/Schedule/ReadEmployees`
- `GET {tenant}.maidcentral.com/Schedule/ReadTeamPositions`
- `GET {tenant}.maidcentral.com/Schedule/ReadTeams`
- `POST eastus-5.in.applicationinsights.azure.com//v2/track (blocked: write)`

#### `/Company/ScheduleExceptions`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 4 table(s)
- `POST {tenant}.maidcentral.com/Company/ScheduleExceptionCalendar (blocked: write)`
- `GET {tenant}.maidcentral.com/Employee/CalendarDayAvailability`
- `GET {tenant}.maidcentral.com/Employee/ScheduleRequests`
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `GET {tenant}.maidcentral.com/ProviderStatus/Current`
- `POST eastus-5.in.applicationinsights.azure.com//v2/track (blocked: write)`
- Form `POST /Employee/ScheduleRequests`: `StartDate:text`, `EndDate:text`
- Form `POST /Company/ScheduleExceptions`: `DefaultAvailableDays:hidden`, `btnUpdateDates:submit`, `Model.StartDate:text`, `Model.EndDate:text`, `Model.Exceptions[:id].EmployeeScheduleExceptionId:hidden`, `Model.Exceptions[:id].ScheduleDate:hidden`, `Model.Exceptions[:id].BlackoutDay:checkbox`, `Model.Exceptions[:id].BlackoutDay:hidden`, `Model.Exceptions[:id].Note:text`

#### `/Customer/Create`

- Rendering: server-rendered + XHR · jquery 1.11.2 · anti-forgery field
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `GET {tenant}.maidcentral.com/img/syncfusion-icons-white.png (blocked: unsafe-get)`
- `GET {tenant}.maidcentral.com/img/syncfusion-icons.png (blocked: unsafe-get)`
- `GET {tenant}.maidcentral.com/ProviderStatus/Current`
- `POST eastus-5.in.applicationinsights.azure.com//v2/track (blocked: write)`
- `GET maps.googleapis.com/maps/api/mapsjs/gen_204`
- Form `POST /Customer/Create`: `__RequestVerificationToken:hidden`, `CustomerQuoteDetailLineId:hidden`, `CustomerFirstName:text`, `CustomerMiddleName:text`, `CustomerLastName:text`, `CustomerTagsSelected:checkbox`, `CustomerCompanyName:text`, `BillingTermsId:select-one`, `CustomerSourceId:select-one`, `EmailInvoice:checkbox`, `EmailInvoice:hidden`, `mycustomfield:text`, `BillingAddress:id:text`, `BillingCountry:hidden`, `BillingCity:text`, `BillingState:text`, `BillingZip:text`, `FirstContactTypeId:select-one`, `FirstContactInfo:text`, `SecondContactTypeId:select-one`, `SecondContactInfo:text`, `HomeAddressSameAsBilling:checkbox`, `HomeAddressSameAsBilling:hidden`, `myothercustomfield:text`, `HomeAddress:id:text`, `HomeCountry:hidden`, `HomeCity:text`, `HomeState:text`, `HomeZip:text`, `HomeSubdivision:text`, `HomeName:text`, `HomeLocationPhone:text`, `HomeServiceTagsSelected:checkbox`, `HomeSpecialInstructions:textarea`, `HomePetInstructions:textarea`, `HomeDirections:textarea`, `HomeSpecialEquipment:textarea`, `HomeWasteDisposal:textarea`, `HomeAcessInformation:textarea`, `HomeInternalMemo:textarea`

#### `/Customer/Search`

- Rendering: server-rendered + XHR · jquery 1.11.2 · anti-forgery field
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `GET {tenant}.maidcentral.com/ProviderStatus/Current`
- `POST eastus-5.in.applicationinsights.azure.com//v2/track (blocked: write)`
- Form `POST /Customer/Search`: `__RequestVerificationToken:hidden`, `Tags:text`
- Form `POST /Customer/AdvancedSearch`: `__RequestVerificationToken:hidden`, `SearchTypeId:radio`, `CustomerSearchId:select-one`, `HomeSearchId:select-one`, `SearchValue:text`

#### `/Job/Schedule`

- Rendering: server-rendered + XHR · knockout, jquery 1.11.2, kendo · anti-forgery field · 5 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `GET {tenant}.maidcentral.com/img/remove-icon-small.png (blocked: unsafe-get)`
- `GET {tenant}.maidcentral.com/Job/AdjustTeamSize`
- `POST {tenant}.maidcentral.com/Job/CustomerEmployeeFlags/ (blocked: write)`
- `POST {tenant}.maidcentral.com/Job/JobResendNotificationFlags/ (blocked: write)`
- `POST {tenant}.maidcentral.com/Job/PreferExcludeFlags/ (blocked: write)`
- `GET {tenant}.maidcentral.com/Job/ReadJobs`
- `GET {tenant}.maidcentral.com/Job/ReadTeams`
- `POST {tenant}.maidcentral.com/Job/ScheduleStats/ (blocked: write)`
- `GET {tenant}.maidcentral.com/ProviderStatus/Current`
- `POST eastus-5.in.applicationinsights.azure.com//v2/track (blocked: write)`
- Form `POST /ServiceSetInformation/PrintJobWorksheets`: `__RequestVerificationToken:hidden`, `PrintDate:hidden`, `PrintStartTeam:select-one`

#### `/Job/TeamMonitor`

- Rendering: server-rendered + XHR · knockout, jquery 1.11.2, kendo · 5 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `GET {tenant}.maidcentral.com/Job/TeamMonitorData`
- `GET {tenant}.maidcentral.com/Job/TeamMonitorTeams`
- `GET {tenant}.maidcentral.com/ProviderStatus/Current`
- `POST eastus-5.in.applicationinsights.azure.com//v2/track (blocked: write)`

#### `/Job/Monthly`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 2 table(s)
- `POST {tenant}.maidcentral.com/Event/CreateOrEditEvent (blocked: write)`
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `POST {tenant}.maidcentral.com/Job/MonthlyData (blocked: write)`
- `GET {tenant}.maidcentral.com/ProviderStatus/Current`
- `POST eastus-5.in.applicationinsights.azure.com//v2/track (blocked: write)`

#### `/Estimate#tab_1`

- Rendering: server-rendered + XHR · jquery 1.11.2
- `POST {tenant}.maidcentral.com/Estimate/Step1 (blocked: write)`
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `POST eastus-5.in.applicationinsights.azure.com//v2/track (blocked: write)`

### Endpoints

#### `GET {tenant}.maidcentral.com/` [page]

- Status: 200, 302 · Auth: cookie · Returns: html, redirect · Seen 3×
- Pages: `/`

#### `GET {tenant}.maidcentral.com/Account/Login` [page] (login)

- Status: 200 · Auth: cookie · Returns: n/a · Seen 1×
- Capabilities: auth
- Query: `ReturnUrl` (<string>)

#### `POST {tenant}.maidcentral.com/Account/Login` [page] (login)

- Status: 302 · Auth: cookie · Returns: n/a · Seen 1×
- Capabilities: auth
- Query: `ReturnUrl` (<string>)

#### `GET {tenant}.maidcentral.com/Account/SendCode` [page] (login)

- Status: 200 · Auth: cookie · Returns: n/a · Seen 1×
- Capabilities: auth
- Query: `ReturnUrl` (<string>); `RememberMe` (<string>)

#### `POST {tenant}.maidcentral.com/Account/SendCode` [page] (login)

- Status: 302 · Auth: cookie · Returns: n/a · Seen 1×
- Capabilities: auth
- Query: `ReturnUrl` (<string>)

#### `GET {tenant}.maidcentral.com/Account/VerifyCode` [page] (login)

- Status: 200 · Auth: cookie · Returns: n/a · Seen 1×
- Capabilities: auth
- Query: `Provider` (<string>); `ReturnUrl` (<string>); `RememberMe` (<string>)

#### `POST {tenant}.maidcentral.com/Account/VerifyCode` [page] (login)

- Status: 302 · Auth: cookie · Returns: n/a · Seen 1×
- Capabilities: auth
- Query: `ReturnUrl` (<string>)

#### `GET {tenant}.maidcentral.com/Communication` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: notes-messages
- Pages: `/Communication`

#### `POST {tenant}.maidcentral.com/Communication/GetMessageThread` [xhr] (blocked during capture: write)

- Status: n/a · Auth: cookie · Returns: n/a · Seen 1×
- Capabilities: notes-messages
- Pages: `/Communication`

<details><summary>Request body</summary>

```json
{
  "id": "number",
  "typeId": "number",
  "contactInfo": "string"
}
```
</details>

#### `GET {tenant}.maidcentral.com/Company/BroadcastMessage` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: notes-messages, settings
- Pages: `/Company/BroadcastMessage`

#### `POST {tenant}.maidcentral.com/Company/BroadcastMessage` [xhr] (blocked during capture: write)

- Status: n/a · Auth: cookie · Returns: n/a · Seen 1×
- Capabilities: notes-messages, settings
- Pages: `/Company/BroadcastMessage`

<details><summary>Request body</summary>

```json
{
  "__RequestVerificationToken": "string",
  "ConfirmedToSend": "string",
  "ServiceCompaniesSelected[:id]": "string",
  "Medium": "string",
  "Subject": "string",
  "From": "string",
  "Message": "string",
  "X-Requested-With": "string"
}
```
</details>

#### `POST {tenant}.maidcentral.com/Company/ScheduleExceptionCalendar` [xhr] (blocked during capture: write)

- Status: n/a · Auth: cookie · Returns: n/a · Seen 4×
- Capabilities: scheduling, settings
- Pages: `/Company/ScheduleExceptions`

<details><summary>Request body</summary>

```json
{
  "start": "string",
  "end": "string"
}
```
</details>

#### `GET {tenant}.maidcentral.com/Company/ScheduleExceptions` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 4×
- Capabilities: scheduling, settings
- Pages: `/Company/ScheduleExceptions`

#### `GET {tenant}.maidcentral.com/Customer` [page]

- Status: 301 · Auth: cookie · Returns: redirect · Seen 1×
- Capabilities: clients
- Pages: `/Customer`

#### `GET {tenant}.maidcentral.com/Customer/Create` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: clients
- Pages: `/Customer/Create`

#### `GET {tenant}.maidcentral.com/Customer/EditTicket/` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 2×
- Capabilities: clients
- Pages: `/`, `/Home`
- Query: `id` (:id); `typeId` (:id); `_` (:id)
- Returns form `POST /Customer/EditTicket`: `__RequestVerificationToken:hidden`, `Id:hidden`, `TicketTypeId:hidden`, `OpenDate:text`, `CloseNotes:textarea`, `btnCloseTicket:submit`

#### `GET {tenant}.maidcentral.com/Customer/Search` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 3×
- Capabilities: clients
- Pages: `/Customer/Search`

#### `GET {tenant}.maidcentral.com/Dashboard/Index/:id` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 2×
- Capabilities: reports
- Pages: `/Dashboard/Index/:id`

#### `GET {tenant}.maidcentral.com/Employee` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: employees
- Pages: `/Employee`

#### `GET {tenant}.maidcentral.com/Employee/CalendarDayAvailability` [xhr]

- Status: 200 · Auth: cookie · Returns: json · Seen 4×
- Capabilities: scheduling, employees
- Pages: `/Company/ScheduleExceptions`
- Query: `start` (<string>); `end` (<string>); `_` (:id)

<details><summary>Response shape</summary>

```json
[]
```
</details>

#### `GET {tenant}.maidcentral.com/Employee/Create` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: employees
- Pages: `/Employee/Create`

#### `GET {tenant}.maidcentral.com/Employee/Dashboard` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: employees, reports
- Pages: `/Employee/Dashboard`

#### `GET {tenant}.maidcentral.com/Employee/EmployeeMonitorData` [xhr]

- Status: 200 · Auth: cookie · Returns: json · Seen 1×
- Capabilities: employees
- Pages: `/Employee/Time#monitor-tab`
- Query: `date` (:date); `view` (<string>); `_` (:id)

<details><summary>Response shape</summary>

```json
[
  {
    "JobInformationTeamId": "number",
    "JobInformationId": "number",
    "ServiceSetInformationId": "number",
    "EmployeeInformationId": "number",
    "Title": "string",
    "Start": "string",
    "End": "string",
    "StartTimezone": "null",
    "EndTimezone": "null",
    "IsAllDay": "boolean",
    "Color": "string",
    "TeamID": "number",
    "AllowedTime": "number",
    "JobStatusId": "number",
    "EventInstructions": "null",
    "ScheduleActualType": "number",
    "FrequencyColor": "null",
    "StatusColor": "null",
    "JobTags": "null",
    "FlagIcon": "null",
    "LastScorecardIcon": "string",
    "RgbTextColor": "null",
    "EntityType": "number",
    "IsRecurringEvent": "boolean"
  }
]
```
</details>

#### `GET {tenant}.maidcentral.com/Employee/EmployeeMonitorTeams` [xhr]

- Status: 200 · Auth: cookie · Returns: json · Seen 1×
- Capabilities: teams, employees
- Pages: `/Employee/Time#monitor-tab`
- Query: `date` (:date); `view` (undefined); `_` (:id)

<details><summary>Response shape</summary>

```json
[
  {
    "TeamID": "number",
    "value": "number",
    "TeamName": "string",
    "text": "string",
    "Color": "null",
    "RgbBackgroundColor": "null",
    "RgbTextColor": "null",
    "TeamMembers": "null",
    "SizeException": "boolean",
    "SortOrder": "number",
    "SizeExceptionValue": "number",
    "BillRate": "null",
    "ScheduledHours": "number",
    "CountJobs": "number",
    "Employees": "null",
    "AllowedHours": "number",
    "ServiceCompanyOfficeId": "null",
    "IsDisabled": "boolean"
  }
]
```
</details>

#### `GET {tenant}.maidcentral.com/Employee/GetEmployeeBreaks` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: employees
- Pages: `/Employee/Time#breaks-tab`
- Query: `_` (:id)

#### `GET {tenant}.maidcentral.com/Employee/ScheduleRequests` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 4×
- Capabilities: scheduling, employees
- Pages: `/Company/ScheduleExceptions`
- Query: `_` (:id)
- Returns form `POST /Employee/ScheduleRequests`: `StartDate:text`, `EndDate:text`

#### `GET {tenant}.maidcentral.com/Employee/Time` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: employees
- Pages: `/Employee/Time`

#### `GET {tenant}.maidcentral.com/Employee/Worksheets` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: employees
- Pages: `/Employee/Dashboard`
- Query: `Date` (<string>); `_` (:id)

#### `GET {tenant}.maidcentral.com/Estimate` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: leads-quotes
- Pages: `/Estimate`

#### `GET {tenant}.maidcentral.com/Estimate/GetOnlineLeads` [xhr]

- Status: 200 · Auth: cookie · Returns: json · Seen 1×
- Capabilities: leads-quotes
- Pages: `/Estimate/SalesPipeline?=:date`
- Query: `serviceCompanyId` (:id); `_` (:id)

<details><summary>Response shape</summary>

```json
[]
```
</details>

#### `POST {tenant}.maidcentral.com/Estimate/GetPipelineData` [xhr] (blocked during capture: write)

- Status: n/a · Auth: cookie · Returns: n/a · Seen 1×
- Capabilities: leads-quotes
- Pages: `/Estimate/SalesPipeline?=:date`

<details><summary>Request body</summary>

```json
{
  "StartDate": "string",
  "EndDate": "string",
  "AssignedUserId": "null",
  "StatusIds": [
    "number"
  ],
  "TagIds": [],
  "CustomerSourceId": "string",
  "ServiceSetTypeGroupId": "null",
  "ShowOnlyWithTickets": "boolean",
  "ViewType": "string",
  "SortBy": "string",
  "SortDirection": "string"
}
```
</details>

#### `GET {tenant}.maidcentral.com/Estimate/SalesPipeline` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: leads-quotes
- Pages: `/Estimate/SalesPipeline`

#### `POST {tenant}.maidcentral.com/Estimate/Step1` [xhr] (blocked during capture: write)

- Status: n/a · Auth: cookie · Returns: n/a · Seen 2×
- Capabilities: leads-quotes
- Pages: `/Estimate#tab_1`

<details><summary>Request body</summary>

```json
{
  "CustomerInformationId": "string",
  "HomeInformationId": "string"
}
```
</details>

#### `POST {tenant}.maidcentral.com/Event/CreateOrEditEvent` [xhr] (blocked during capture: write)

- Status: n/a · Auth: cookie · Returns: n/a · Seen 1×
- Pages: `/Job/Monthly`

#### `POST {tenant}.maidcentral.com/Event/Events` [xhr] (blocked during capture: write)

- Status: n/a · Auth: cookie · Returns: n/a · Seen 1×
- Pages: `/Employee/Time#monitor-tab`

<details><summary>Request body</summary>

```json
{
  "date": "string"
}
```
</details>

#### `GET {tenant}.maidcentral.com/Home` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: clients
- Pages: `/Home`

#### `GET {tenant}.maidcentral.com/Home/CustomerServiceRequests/` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 3×
- Capabilities: clients
- Pages: `/`, `/Home`
- Query: `_` (:id)

#### `GET {tenant}.maidcentral.com/Home/GetChartData/` [xhr]

- Status: 200 · Auth: cookie · Returns: json · Seen 3×
- Capabilities: clients
- Pages: `/`, `/Home`
- Query: `_` (:id)

<details><summary>Response shape</summary>

```json
[
  {
    "JobData": [
      {
        "label": "string",
        "data": [
          [
            "number"
          ]
        ]
      }
    ],
    "RevenueData": [
      {
        "label": "string",
        "data": [
          [
            "number"
          ]
        ]
      }
    ],
    "HourData": [
      {
        "label": "string",
        "data": [
          [
            "number"
          ]
        ]
      }
    ],
    "MixData": [
      {
        "label": "string",
        "data": [
          [
            "number"
          ]
        ]
      }
    ]
  }
]
```
</details>

#### `GET {tenant}.maidcentral.com/Home/NewCustomersWidget` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 3×
- Capabilities: clients
- Pages: `/`, `/Home`
- Query: `_` (:id)

#### `GET {tenant}.maidcentral.com/Home/OpenContactTickets` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 3×
- Capabilities: clients
- Pages: `/`, `/Home`
- Query: `_` (:id)

#### `GET {tenant}.maidcentral.com/Home/SalesDashboard` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 2×
- Capabilities: clients, reports
- Pages: `/Home/SalesDashboard`

#### `GET {tenant}.maidcentral.com/Home/SalesExternalFormQuotes` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 2×
- Capabilities: clients, leads-quotes
- Pages: `/Home/SalesDashboard`
- Query: `_` (:id)

#### `GET {tenant}.maidcentral.com/Home/SalesOpenNotes` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 2×
- Capabilities: clients, notes-messages
- Pages: `/Home/SalesDashboard`
- Query: `_` (:id)

#### `GET {tenant}.maidcentral.com/Home/SalesQuotesAction` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 2×
- Capabilities: clients, leads-quotes
- Pages: `/Home/SalesDashboard`
- Query: `_` (:id)

#### `GET {tenant}.maidcentral.com/Home/SalesServiceRequests` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 2×
- Capabilities: clients
- Pages: `/Home/SalesDashboard`
- Query: `_` (:id)

#### `GET {tenant}.maidcentral.com/Home/Sidebar` [xhr]

- Status: 200 · Auth: cookie · Returns: json · Seen 29×
- Capabilities: clients
- Pages: `/`, `/Communication`, `/Company/BroadcastMessage`, `/Company/ScheduleExceptions`, `/Customer/Create`, `/Customer/Search`, `/Dashboard/Index/:id`, `/Employee`, `/Employee/Create`, `/Employee/Time#monitor-tab`, `/Estimate#tab_1`, `/Estimate/SalesPipeline?=:date`, `/Home`, `/Home/SalesDashboard`, `/Job/Monthly`, `/Job/Schedule`, `/Job/TeamMonitor`, `/Schedule`
- Query: `_` (:id)

<details><summary>Response shape</summary>

```json
{
  "count": "string",
  "sidebar": "string"
}
```
</details>

#### `GET {tenant}.maidcentral.com/img/remove-icon-small.png` [xhr] (blocked during capture: unsafe-get)

- Status: n/a · Auth: cookie · Returns: n/a · Seen 5×
- Pages: `/`, `/Estimate/SalesPipeline?=:date`, `/Home`, `/Job/Schedule`, `/Schedule`

#### `GET {tenant}.maidcentral.com/img/syncfusion-icons-white.png` [xhr] (blocked during capture: unsafe-get)

- Status: n/a · Auth: cookie · Returns: n/a · Seen 1×
- Pages: `/Customer/Create`

#### `GET {tenant}.maidcentral.com/img/syncfusion-icons.png` [xhr] (blocked during capture: unsafe-get)

- Status: n/a · Auth: cookie · Returns: n/a · Seen 1×
- Pages: `/Customer/Create`

#### `GET {tenant}.maidcentral.com/Job` [page]

- Status: 301 · Auth: cookie · Returns: redirect · Seen 1×
- Capabilities: jobs
- Pages: `/Job`

#### `GET {tenant}.maidcentral.com/Job/AdjustTeamSize` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: jobs, teams
- Pages: `/Job/Schedule`
- Query: `Date` (:date); `_` (:id)
- Returns form `POST /Job/AdjustTeamSize`: `Date:hidden`, `<key>:hidden`, `<key>:text`

#### `GET {tenant}.maidcentral.com/Job/CheckNextJobNotificationOnWay` [xhr]

- Status: 200 · Auth: cookie · Returns: json · Seen 1×
- Capabilities: jobs, notes-messages
- Pages: `/Employee/Dashboard`
- Query: `eid` (:id); `date` (<string>); `jobId` (); `_` (:id)

<details><summary>Response shape</summary>

```json
{
  "showModal": "boolean"
}
```
</details>

#### `POST {tenant}.maidcentral.com/Job/CustomerEmployeeFlags/` [xhr] (blocked during capture: write)

- Status: n/a · Auth: cookie · Returns: n/a · Seen 5×
- Capabilities: clients, jobs, employees
- Pages: `/Job/Schedule`, `/Schedule`

<details><summary>Request body</summary>

```json
{
  "date": "string"
}
```
</details>

#### `POST {tenant}.maidcentral.com/Job/JobResendNotificationFlags/` [xhr] (blocked during capture: write)

- Status: n/a · Auth: cookie · Returns: n/a · Seen 1×
- Capabilities: jobs, notes-messages
- Pages: `/Job/Schedule`

<details><summary>Request body</summary>

```json
{
  "date": "string"
}
```
</details>

#### `GET {tenant}.maidcentral.com/Job/Monthly` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: jobs
- Pages: `/Job/Monthly`

#### `POST {tenant}.maidcentral.com/Job/MonthlyData` [xhr] (blocked during capture: write)

- Status: n/a · Auth: cookie · Returns: n/a · Seen 1×
- Capabilities: jobs
- Pages: `/Job/Monthly`

<details><summary>Request body</summary>

```json
{
  "colorById": "string",
  "start": "number",
  "end": "number",
  "serviceSetTypeGroupIds": [],
  "teamIds": [],
  "zoneIds": [],
  "jobStatuses": [
    "string"
  ],
  "serviceTypes": [],
  "officeIds": [],
  "customerTags": [],
  "homeTags": [],
  "serviceSetTags": [],
  "jobTags": [],
  "eventTags": []
}
```
</details>

#### `POST {tenant}.maidcentral.com/Job/PreferExcludeFlags/` [xhr] (blocked during capture: write)

- Status: n/a · Auth: cookie · Returns: n/a · Seen 1×
- Capabilities: jobs
- Pages: `/Job/Schedule`

<details><summary>Request body</summary>

```json
{
  "date": "string"
}
```
</details>

#### `GET {tenant}.maidcentral.com/Job/ReadJobs` [xhr]

- Status: 200 · Auth: cookie · Returns: json · Seen 1×
- Capabilities: jobs
- Pages: `/Job/Schedule`
- Query: `date` (:date); `view` (<string>); `_` (:id)

<details><summary>Response shape</summary>

```json
[
  {
    "JobInformationTeamId": "number",
    "JobInformationId": "number",
    "ServiceSetInformationId": "number",
    "EmployeeInformationId": "number",
    "Title": "string",
    "Start": "string",
    "End": "string",
    "StartTimezone": "null",
    "EndTimezone": "null",
    "IsAllDay": "boolean",
    "Color": "string",
    "TeamID": "number",
    "AllowedTime": "number",
    "JobStatusId": "number",
    "EventInstructions": "string",
    "ScheduleActualType": "number",
    "FrequencyColor": "string",
    "StatusColor": "string",
    "JobTags": "string",
    "FlagIcon": "string",
    "LastScorecardIcon": "string",
    "RgbTextColor": "string",
    "EntityType": "number",
    "IsRecurringEvent": "boolean"
  }
]
```
</details>

#### `GET {tenant}.maidcentral.com/Job/ReadTeams` [xhr]

- Status: 200 · Auth: cookie · Returns: json · Seen 1×
- Capabilities: jobs, teams
- Pages: `/Job/Schedule`
- Query: `date` (:date); `view` (<string>); `_` (:id)

<details><summary>Response shape</summary>

```json
[
  {
    "TeamID": "number",
    "value": "number",
    "TeamName": "string",
    "text": "string",
    "Color": "string",
    "RgbBackgroundColor": "string",
    "RgbTextColor": "string",
    "TeamMembers": "string",
    "SizeException": "boolean",
    "SortOrder": "number",
    "SizeExceptionValue": "number",
    "BillRate": "null",
    "ScheduledHours": "number",
    "CountJobs": "number",
    "Employees": [
      {
        "EmployeeID": "number",
        "EmployeeTeamScheduleId": "number",
        "HireDate": "null",
        "value": "number",
        "text": "null",
        "FirstName": "string",
        "LastName": "string",
        "FullName": "string",
        "ScheduledTime": "string",
        "Position": "string",
        "PositionColor": "string",
        "StartTime": "string",
        "EndTime": "string",
        "StartTimeString": "string",
        "EndTimeString": "string"
      }
    ],
    "AllowedHours": "number",
    "ServiceCompanyOfficeId": "null",
    "IsDisabled": "boolean"
  }
]
```
</details>

#### `GET {tenant}.maidcentral.com/Job/Schedule` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: jobs, scheduling
- Pages: `/Job/Schedule`

#### `POST {tenant}.maidcentral.com/Job/ScheduleStats/` [xhr] (blocked during capture: write)

- Status: n/a · Auth: cookie · Returns: n/a · Seen 1×
- Capabilities: jobs, scheduling, reports
- Pages: `/Job/Schedule`

<details><summary>Request body</summary>

```json
{
  "date": "string"
}
```
</details>

#### `GET {tenant}.maidcentral.com/Job/TeamMonitor` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 2×
- Capabilities: jobs, teams
- Pages: `/Job/TeamMonitor`

#### `GET {tenant}.maidcentral.com/Job/TeamMonitorData` [xhr]

- Status: 200 · Auth: cookie · Returns: json · Seen 3×
- Capabilities: jobs, teams
- Pages: `/Job/TeamMonitor`, `/Job/TeamMonitor?Date=:date`
- Query: `date` (:date); `view` (<string>); `showJobClocks` (undefined, true); `_` (:id)

<details><summary>Response shape</summary>

```json
[
  {
    "JobInformationTeamId": "number",
    "JobInformationId": "number",
    "ServiceSetInformationId": "number",
    "EmployeeInformationId": "number",
    "Title": "string",
    "Start": "string",
    "End": "string",
    "StartTimezone": "null",
    "EndTimezone": "null",
    "IsAllDay": "boolean",
    "Color": "string",
    "TeamID": "number",
    "AllowedTime": "number",
    "JobStatusId": "number",
    "EventInstructions": "null",
    "ScheduleActualType": "number",
    "FrequencyColor": "null",
    "StatusColor": "null",
    "JobTags": "null",
    "FlagIcon": "null",
    "LastScorecardIcon": "null",
    "RgbTextColor": "null",
    "EntityType": "number",
    "IsRecurringEvent": "boolean"
  }
]
```
</details>

#### `GET {tenant}.maidcentral.com/Job/TeamMonitorTeams` [xhr]

- Status: 200 · Auth: cookie · Returns: json · Seen 3×
- Capabilities: jobs, teams
- Pages: `/Job/TeamMonitor`, `/Job/TeamMonitor?Date=:date`
- Query: `date` (:date, <string>); `view` (undefined, <string>); `_` (:id); `showJobClocks` (true)

<details><summary>Response shape</summary>

```json
[
  {
    "TeamID": "number",
    "value": "number",
    "TeamName": "string",
    "text": "string",
    "Color": "string",
    "RgbBackgroundColor": "string",
    "RgbTextColor": "string",
    "TeamMembers": "null",
    "SizeException": "boolean",
    "SortOrder": "number",
    "SizeExceptionValue": "number",
    "BillRate": "null",
    "ScheduledHours": "number",
    "CountJobs": "number",
    "Employees": "null",
    "AllowedHours": "number",
    "ServiceCompanyOfficeId": "null",
    "IsDisabled": "boolean"
  }
]
```
</details>

#### `GET {tenant}.maidcentral.com/plugins/tinymce/plugins/importcss/plugin.min.js` [xhr] (blocked during capture: unsafe-get)

- Status: n/a · Auth: cookie · Returns: n/a · Seen 1×
- Pages: `/Company/BroadcastMessage`

#### `GET {tenant}.maidcentral.com/ProviderStatus/Current` [xhr]

- Status: 200 · Auth: cookie · Returns: json · Seen 13×
- Capabilities: reports
- Pages: `/Company/BroadcastMessage`, `/Company/ScheduleExceptions`, `/Customer/Create`, `/Customer/Search`, `/Job/Monthly`, `/Job/Schedule`, `/Job/TeamMonitor`

<details><summary>Response shape</summary>

```json
[]
```
</details>

#### `GET {tenant}.maidcentral.com/report/bidata` [xhr]

- Status: 200 · Auth: cookie · Returns: json · Seen 3×
- Capabilities: reports
- Pages: `/`, `/Home`
- Query: `biTaskTypeIds[0]` (:id); `biTaskTypeIds[1]` (:id); `biTaskTypeIds[2]` (:id); `status` (:id); `maxResultCount` (:id); `_` (:id)

<details><summary>Response shape</summary>

```json
{
  "TotalCount": "number",
  "Items": [
    {
      "BiTaskId": "number",
      "MainText": "string",
      "SubText": "string",
      "RecordType": "string",
      "RecordId": "number",
      "BiTaskTypeId": "number",
      "DateCreated": "string",
      "LatestHistory": "null",
      "BiTaskType": {
        "Name": "string",
        "Description": "string",
        "Icon": "string",
        "Color": "string"
      }
    }
  ]
}
```
</details>

#### `POST {tenant}.maidcentral.com/report/getTimeChangeRequests` [xhr] (blocked during capture: write)

- Status: n/a · Auth: cookie · Returns: n/a · Seen 1×
- Capabilities: reports
- Pages: `/Employee/Time#monitor-tab`
- Query: `minDateFilter` (<string>); `maxDateFilter` (<string>); `sorting` (<string>); `skipCount` (:id); `maxResultCount` (:id)

#### `GET {tenant}.maidcentral.com/Schedule` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 3×
- Capabilities: scheduling
- Pages: `/Schedule`

#### `POST {tenant}.maidcentral.com/Schedule/AbsentEmployees/` [xhr] (blocked during capture: write)

- Status: n/a · Auth: cookie · Returns: n/a · Seen 10×
- Capabilities: scheduling, employees
- Pages: `/Schedule`, `/Schedule?Date=:date`

<details><summary>Request body</summary>

```json
{
  "date": "string"
}
```
</details>

#### `GET {tenant}.maidcentral.com/Schedule/GetSchedulerItemDetails` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: scheduling
- Pages: `/Schedule`
- Query: `id` (:id); `returnType` (:id); `date` (:date); `CalendarUpdate` (<string>); `_` (:id)
- Returns form `POST /Schedule/EditSchedulerItemDetails`: `__RequestVerificationToken:hidden`, `EmployeeTeamScheduleId:hidden`, `EmployeeInformationId:select-one`, `ScheduleDate:text`, `StartTime:text`, `EndDate:text`, `EndTime:text`, `OutCode:select-one`, `TeamId:select-one`, `TeamPositionId:select-one`, `Late:checkbox`, `Late:hidden`, `Reason:textarea`, `command:submit`

#### `GET {tenant}.maidcentral.com/Schedule/Read` [xhr]

- Status: 200 · Auth: cookie · Returns: json · Seen 4×
- Capabilities: scheduling
- Pages: `/Schedule`, `/Schedule?Date=:date`
- Query: `date` (:date); `view` (<string>); `_` (:id)

<details><summary>Response shape</summary>

```json
[
  {
    "ScheduleID": "number",
    "TeamID": "number",
    "TeamPositionID": "null|string",
    "EmployeeID": "number",
    "Title": "string",
    "Start": "string",
    "End": "string",
    "StartTimezone": "null",
    "EndTimezone": "null",
    "OutCode": "string",
    "Reason": "null",
    "Approved": "boolean",
    "Excused": "boolean",
    "Late": "boolean",
    "Absent": "boolean",
    "Available": "boolean",
    "IsAllDay": "boolean",
    "RecurrenceRule": "null",
    "RecurrenceException": "null",
    "RecurrenceID": "null",
    "Color": "string",
    "HireDate": "string"
  }
]
```
</details>

#### `GET {tenant}.maidcentral.com/Schedule/ReadEmployees` [xhr]

- Status: 200 · Auth: cookie · Returns: json · Seen 3×
- Capabilities: scheduling, employees
- Pages: `/Schedule`
- Query: `date` (:date); `_` (:id)

<details><summary>Response shape</summary>

```json
[
  {
    "EmployeeID": "number",
    "EmployeeTeamScheduleId": "number",
    "HireDate": "string",
    "value": "number",
    "text": "string",
    "FirstName": "null",
    "LastName": "null",
    "FullName": "null",
    "ScheduledTime": "null",
    "Position": "null",
    "PositionColor": "null",
    "StartTime": "null",
    "EndTime": "null",
    "StartTimeString": "null",
    "EndTimeString": "null"
  }
]
```
</details>

#### `GET {tenant}.maidcentral.com/Schedule/ReadTeamPositions` [xhr]

- Status: 200 · Auth: cookie · Returns: json · Seen 3×
- Capabilities: scheduling, teams
- Pages: `/Schedule`
- Query: `date` (:date); `_` (:id)

<details><summary>Response shape</summary>

```json
[
  {
    "TeamPositionID": "number",
    "value": "number",
    "TeamPositionName": "string",
    "text": "string",
    "color": "string"
  }
]
```
</details>

#### `GET {tenant}.maidcentral.com/Schedule/ReadTeams` [xhr]

- Status: 200 · Auth: cookie · Returns: json · Seen 4×
- Capabilities: scheduling, teams
- Pages: `/Schedule`, `/Schedule?Date=:date`
- Query: `date` (:date, <string>); `_` (:id); `view` (<string>)

<details><summary>Response shape</summary>

```json
[
  {
    "TeamID": "number",
    "value": "number",
    "TeamName": "string",
    "text": "string",
    "Color": "null",
    "RgbBackgroundColor": "null",
    "RgbTextColor": "null",
    "TeamMembers": "null",
    "SizeException": "boolean",
    "SortOrder": "number",
    "SizeExceptionValue": "number",
    "BillRate": "null",
    "ScheduledHours": "number",
    "CountJobs": "number",
    "Employees": "null",
    "AllowedHours": "number",
    "ServiceCompanyOfficeId": "null",
    "IsDisabled": "boolean"
  }
]
```
</details>

#### `GET {tenant}.maidcentral.com/signalr/negotiate` [xhr]

- Status: 200 · Auth: cookie · Returns: json · Seen 1×
- Pages: `/Estimate/SalesPipeline?=:date`
- Query: `clientProtocol` (<string>); `connectionData` (<string>); `_` (:id)

<details><summary>Response shape</summary>

```json
{
  "Url": "string",
  "ConnectionToken": "string",
  "ConnectionId": "string",
  "KeepAliveTimeout": "number",
  "DisconnectTimeout": "number",
  "ConnectionTimeout": "number",
  "TryWebSockets": "boolean",
  "ProtocolVersion": "string",
  "TransportConnectTimeout": "number",
  "LongPollDelay": "number"
}
```
</details>

#### `GET {tenant}.maidcentral.com/signalr/start` [xhr]

- Status: 200 · Auth: cookie · Returns: json · Seen 1×
- Pages: `/Estimate/SalesPipeline?=:date`
- Query: `transport` (<string>); `clientProtocol` (<string>); `connectionToken` (<string>); `connectionData` (<string>); `_` (:id)

<details><summary>Response shape</summary>

```json
{
  "Response": "string"
}
```
</details>

#### `POST {tenant}.maidcentral.com/Time/GetAllTimeChangeRequestsForEmployee` [xhr] (blocked during capture: write)

- Status: n/a · Auth: cookie · Returns: n/a · Seen 1×
- Capabilities: employees
- Pages: `/Employee/Dashboard`

<details><summary>Request body</summary>

```json
{
  "employeeInformationId": "string",
  "minDateFilter": "string",
  "maxDateFilter": "string"
}
```
</details>

#### `POST eastus-5.in.applicationinsights.azure.com//v2/track` [xhr] (blocked during capture: write)

- Status: n/a · Auth: cookie · Returns: n/a · Seen 33×
- Pages: `/`, `/Account/Login?ReturnUrl=*`, `/Account/SendCode?RememberMe=*&ReturnUrl=*`, `/Account/VerifyCode?Provider=*&RememberMe=*&ReturnUrl=*`, `/Communication`, `/Company/BroadcastMessage`, `/Company/ScheduleExceptions`, `/Customer/Create`, `/Customer/Search`, `/Dashboard/Index/:id`, `/Employee`, `/Employee/Create`, `/Employee/Dashboard`, `/Employee/Time#monitor-tab`, `/Estimate#tab_1`, `/Estimate/SalesPipeline?=:date`, `/Home`, `/Home/SalesDashboard`, `/Job/Monthly`, `/Job/Schedule`, `/Job/TeamMonitor`, `/Schedule`

<details><summary>Request body</summary>

```json
[
  {
    "time": "string",
    "iKey": "string",
    "name": "string",
    "sampleRate": "number",
    "tags": {
      "ai.device.id": "string",
      "ai.device.type": "string",
      "ai.operation.name": "string",
      "ai.internal.sdkVersion": "string"
    },
    "data": {
      "baseData": {
        "ver": "number",
        "exceptions": [
          {
            "typeName": "string",
            "message": "string",
            "hasFullStack": "boolean",
            "stack": "string",
            "parsedStack": []
          }
        ],
        "message": "string",
        "properties": {
          "endpoint": "string"
        }
      },
      "baseType": "string"
    }
  }
]
```
</details>

#### `GET maps.googleapis.com/maps/api/mapsjs/gen_204` [xhr]

- Status: 200 · Auth: cookie · Returns: json · Seen 4×
- Pages: `/Customer/Create`, `/Employee/Create`, `/Employee/Dashboard`, `/Employee/Time#monitor-tab`
- Query: `csp_test` (true)

<details><summary>Response shape</summary>

```json
{}
```
</details>
