# MaidCentral API catalog

Generated 2026-11-02T18:09:48.800Z by `npm run catalog`. Do not edit by hand.

Shapes only: every value is replaced by its type, ids by `:id`, the company subdomain by `{tenant}`.
No names, emails, phones, addresses, notes, pay rates or search text.

## Coverage

| Capability | Where | Official API (read / write) | Portal (read / write) |
| --- | --- | --- | --- |
| Sign-in and session | **official API** | 0 / 1 | 0 / 0 |
| Clients and homes | **portal only** | 0 / 0 | 50 / 1 |
| Leads and quotes | **both** | 2 / 4 | 21 / 1 |
| Jobs | **portal only** | 0 / 0 | 24 / 1 |
| Schedule and dispatch | **both** | 1 / 0 | 25 / 0 |
| Teams | **both** | 1 / 0 | 10 / 0 |
| Employees | **portal only** | 0 / 0 | 40 / 1 |
| Payroll and time | **not seen** | 0 / 0 | 0 / 0 |
| Invoices and payments | **portal only** | 0 / 0 | 11 / 0 |
| Pricing and services | **both** | 5 / 1 | 10 / 0 |
| Notes and messages | **both** | 3 / 1 | 14 / 2 |
| Reports and dashboard | **portal only** | 0 / 0 | 75 / 2 |
| Settings and lookups | **both** | 4 / 0 | 39 / 3 |

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
- Browser storage keys: localStorage `data-bs-theme`, `data-bs-theme-mode`; sessionStorage (none)
- Login requests: none

### Pages

#### `/`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 5 table(s)
- `GET {tenant}.maidcentral.com/Customer/EditTicket/`
- `GET {tenant}.maidcentral.com/Home/CustomerServiceRequests/`
- `GET {tenant}.maidcentral.com/Home/GetChartData/`
- `GET {tenant}.maidcentral.com/Home/NewCustomersWidget`
- `GET {tenant}.maidcentral.com/Home/OpenContactTickets`
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `GET {tenant}.maidcentral.com/report/bidata`

#### `/Home`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 5 table(s)
- `GET {tenant}.maidcentral.com/Customer/EditTicket/`
- `GET {tenant}.maidcentral.com/Home/CustomerServiceRequests/`
- `GET {tenant}.maidcentral.com/Home/GetChartData/`
- `GET {tenant}.maidcentral.com/Home/NewCustomersWidget`
- `GET {tenant}.maidcentral.com/Home/OpenContactTickets`
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `GET {tenant}.maidcentral.com/report/bidata`

#### `/Home/SalesDashboard`

- Rendering: server-rendered + XHR · jquery 1.11.2
- `GET {tenant}.maidcentral.com/Home/SalesExternalFormQuotes`
- `GET {tenant}.maidcentral.com/Home/SalesOpenNotes`
- `GET {tenant}.maidcentral.com/Home/SalesQuotesAction`
- `GET {tenant}.maidcentral.com/Home/SalesServiceRequests`
- `GET {tenant}.maidcentral.com/Home/Sidebar`

#### `/Estimate/SalesPipeline?=:date`

- Rendering: server-rendered + XHR · jquery 1.11.2, signalR
- `GET {tenant}.maidcentral.com/Estimate/GetOnlineLeads`
- `POST {tenant}.maidcentral.com/Estimate/GetPipelineData`
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `GET {tenant}.maidcentral.com/signalr/negotiate`
- `GET {tenant}.maidcentral.com/signalr/start`
- Form `GET (same page)`: (no fields)

#### `/Communication?id=:id&info=*&typeId=:id`

- Rendering: server-rendered + XHR · jquery 1.11.2
- `GET {tenant}.maidcentral.com/Home/Sidebar`

#### `/Employee/Dashboard`

- Rendering: server-rendered + XHR · jquery 1.11.2
- `GET {tenant}.maidcentral.com/Employee/Worksheets`
- `GET {tenant}.maidcentral.com/Job/CheckNextJobNotificationOnWay`
- `POST {tenant}.maidcentral.com/Time/GetAllTimeChangeRequestsForEmployee`
- `GET maps.googleapis.com/maps/api/mapsjs/gen_204`
- Form `POST /Customer/Search`: `Tags:text`

#### `/Dashboard/Index/:id`

- Rendering: server-rendered + XHR · jquery 1.11.2, signalR · 4 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`

#### `/Employee/Create`

- Rendering: server-rendered + XHR · jquery 1.11.2 · anti-forgery field
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `GET maps.googleapis.com/maps/api/mapsjs/gen_204`
- Form `POST /Employee/Create`: `__RequestVerificationToken:hidden`, `Role:hidden`, `Prefix:text`, `FirstName:text`, `MiddleName:text`, `LastName:text`, `HireDate:text`, `DriversLicenseNumber:text`, `DriversLicenseNumberState:text`, `AddScheduleTag:checkbox`, `AddScheduleTag:hidden`, `EmergencyContactName:text`, `EmergencyContactPhone:text`, `FirstContactTypeId:select-one`, `FirstContactInfo:text`, `Email:email`, `RolesSelected:checkbox`, `mycustomfield:text`, `MailingAddress:id:text`, `MailingCountry:hidden`, `MailingCity:text`, `MailingRegion:text`, `MailingPostalCode:text`, `PhysicalSameAsMailing:checkbox`, `PhysicalSameAsMailing:hidden`, `myothercustomfield:text`, `PhysicalAddress:id:text`, `PhysicalCountry:hidden`, `PhysicalCity:text`, `PhysicalRegion:text`, `PhysicalPostalCode:text`, `FederalTaxCredits:text`, `StateTaxCredits:text`, `MaritalStatusId:select-one`, `Withholdings:text`, `DateOfBirth:text`, `ServiceCompanyGroupPolicyId:select-one`, `Salary:text`, `HourlyRate:text`, `MinimumWageRate:text`, `MaxHourlyRate:text`

#### `/Employee`

- Rendering: server-rendered + XHR · jquery 1.11.2 · anti-forgery field · 1 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- Form `GET /Employee`: `TagsSelected:checkbox`, `SkillsSelected:checkbox`, `ShowTerminated:checkbox`, `ShowTerminated:hidden`
- Form `POST /Employee/LockEmployeeAccount`: `__RequestVerificationToken:hidden`

#### `/Employee/Time#monitor-tab`

- Rendering: server-rendered + XHR · knockout, jquery 1.11.2, kendo · 20 table(s)
- `GET {tenant}.maidcentral.com/Employee/EmployeeMonitorData`
- `GET {tenant}.maidcentral.com/Employee/EmployeeMonitorTeams`
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `POST {tenant}.maidcentral.com/report/getTimeChangeRequests`
- `GET maps.googleapis.com/maps/api/mapsjs/gen_204`
- Form `POST /Time/ExportTimeClockData`: `StartDate:text`, `EndDate:text`, `ExportTypes:checkbox`

#### `/Company/BroadcastMessage`

- Rendering: server-rendered + XHR · jquery 1.11.2 · anti-forgery field
- `POST {tenant}.maidcentral.com/Company/BroadcastMessage (blocked: write)`
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `GET {tenant}.maidcentral.com/ProviderStatus/Current`
- Form `POST /Company/BroadcastMessage`: `__RequestVerificationToken:hidden`, `ConfirmedToSend:hidden`, `ServiceCompaniesSelected[:id]:hidden`, `Medium:radio`, `Subject:text`, `From:email`, `Message:textarea`

#### `/Schedule`

- Rendering: server-rendered + XHR · knockout, jquery 1.11.2, kendo · 5 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `POST {tenant}.maidcentral.com/Job/CustomerEmployeeFlags/`
- `POST {tenant}.maidcentral.com/Schedule/AbsentEmployees/`
- `GET {tenant}.maidcentral.com/Schedule/GetSchedulerItemDetails`
- `GET {tenant}.maidcentral.com/Schedule/Read`
- `GET {tenant}.maidcentral.com/Schedule/ReadEmployees`
- `GET {tenant}.maidcentral.com/Schedule/ReadTeamPositions`
- `GET {tenant}.maidcentral.com/Schedule/ReadTeams`

#### `/Company/ScheduleExceptions`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 4 table(s)
- `POST {tenant}.maidcentral.com/Company/ScheduleExceptionCalendar`
- `GET {tenant}.maidcentral.com/Employee/CalendarDayAvailability`
- `GET {tenant}.maidcentral.com/Employee/ScheduleRequests`
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `GET {tenant}.maidcentral.com/ProviderStatus/Current`
- Form `POST /Employee/ScheduleRequests`: `StartDate:text`, `EndDate:text`
- Form `POST /Company/ScheduleExceptions`: `DefaultAvailableDays:hidden`, `btnUpdateDates:submit`, `Model.StartDate:text`, `Model.EndDate:text`, `Model.Exceptions[:id].EmployeeScheduleExceptionId:hidden`, `Model.Exceptions[:id].ScheduleDate:hidden`, `Model.Exceptions[:id].BlackoutDay:checkbox`, `Model.Exceptions[:id].BlackoutDay:hidden`, `Model.Exceptions[:id].Note:text`

#### `/Customer/Create`

- Rendering: server-rendered + XHR · jquery 1.11.2 · anti-forgery field
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `GET {tenant}.maidcentral.com/ProviderStatus/Current`
- `GET maps.googleapis.com/maps/api/mapsjs/gen_204`
- Form `POST /Customer/Create`: `__RequestVerificationToken:hidden`, `CustomerQuoteDetailLineId:hidden`, `CustomerFirstName:text`, `CustomerMiddleName:text`, `CustomerLastName:text`, `CustomerTagsSelected:checkbox`, `CustomerCompanyName:text`, `BillingTermsId:select-one`, `CustomerSourceId:select-one`, `EmailInvoice:checkbox`, `EmailInvoice:hidden`, `mycustomfield:text`, `BillingAddress:id:text`, `BillingCountry:hidden`, `BillingCity:text`, `BillingState:text`, `BillingZip:text`, `FirstContactTypeId:select-one`, `FirstContactInfo:text`, `SecondContactTypeId:select-one`, `SecondContactInfo:text`, `HomeAddressSameAsBilling:checkbox`, `HomeAddressSameAsBilling:hidden`, `myothercustomfield:text`, `HomeAddress:id:text`, `HomeCountry:hidden`, `HomeCity:text`, `HomeState:text`, `HomeZip:text`, `HomeSubdivision:text`, `HomeName:text`, `HomeLocationPhone:text`, `HomeServiceTagsSelected:checkbox`, `HomeSpecialInstructions:textarea`, `HomePetInstructions:textarea`, `HomeDirections:textarea`, `HomeSpecialEquipment:textarea`, `HomeWasteDisposal:textarea`, `HomeAcessInformation:textarea`, `HomeInternalMemo:textarea`

#### `/Customer/Search`

- Rendering: server-rendered + XHR · jquery 1.11.2 · anti-forgery field
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `GET {tenant}.maidcentral.com/ProviderStatus/Current`
- Form `POST /Customer/Search`: `__RequestVerificationToken:hidden`, `Tags:text`
- Form `POST /Customer/AdvancedSearch`: `__RequestVerificationToken:hidden`, `SearchTypeId:radio`, `CustomerSearchId:select-one`, `HomeSearchId:select-one`, `SearchValue:text`

#### `/Job/Schedule`

- Rendering: server-rendered + XHR · knockout, jquery 1.11.2, kendo · anti-forgery field · 5 table(s)
- `POST {tenant}.maidcentral.com/Event/CreateOrEditEvent (blocked: write)`
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `GET {tenant}.maidcentral.com/Job/AdjustTeamSize`
- `POST {tenant}.maidcentral.com/Job/CustomerEmployeeFlags/`
- `POST {tenant}.maidcentral.com/Job/JobResendNotificationFlags/ (blocked: write)`
- `POST {tenant}.maidcentral.com/Job/PreferExcludeFlags/`
- `GET {tenant}.maidcentral.com/Job/ReadJobs`
- `GET {tenant}.maidcentral.com/Job/ReadTeams`
- `POST {tenant}.maidcentral.com/Job/ScheduleStats/`
- `GET {tenant}.maidcentral.com/ProviderStatus/Current`
- Form `POST /ServiceSetInformation/PrintJobWorksheets`: `__RequestVerificationToken:hidden`, `PrintDate:hidden`, `PrintStartTeam:select-one`

#### `/Job/TeamMonitor`

- Rendering: server-rendered + XHR · knockout, jquery 1.11.2, kendo · 5 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `GET {tenant}.maidcentral.com/Job/TeamMonitorData`
- `GET {tenant}.maidcentral.com/Job/TeamMonitorTeams`
- `GET {tenant}.maidcentral.com/ProviderStatus/Current`

#### `/Job/Monthly`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 2 table(s)
- `POST {tenant}.maidcentral.com/Event/CreateOrEditEvent (blocked: write)`
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `POST {tenant}.maidcentral.com/Job/MonthlyData`
- `GET {tenant}.maidcentral.com/ProviderStatus/Current`

#### `/Estimate#tab_1`

- Rendering: server-rendered + XHR · jquery 1.11.2
- `POST {tenant}.maidcentral.com/Estimate/Step1 (blocked: write)`
- `GET {tenant}.maidcentral.com/Home/Sidebar`

#### `/Estimate/Search`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 1 table(s)
- `GET {tenant}.maidcentral.com/estimate/GetSearch`
- `GET {tenant}.maidcentral.com/Home/Sidebar`

#### `/Property`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 1 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`

#### `/Report`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 1 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`

#### `/Report/Kiosk`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 1 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `GET {tenant}.maidcentral.com/Report/ActivityPipeline`
- `GET {tenant}.maidcentral.com/Report/GetSalesServiceCompany`
- `GET {tenant}.maidcentral.com/Report/RevenueFuture`
- `GET {tenant}.maidcentral.com/Report/RevenuePast`
- `GET {tenant}.maidcentral.com/Report/SalesPipeline`

#### `/Report/SalesKpi?EndDate=:date&StartDate=:date`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 3 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- Form `GET (same page)`: `StartDate:hidden`, `EndDate:hidden`

#### `/Report/SalesKpi2`

- Rendering: server-rendered + XHR · jquery 1.11.2
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `GET {tenant}.maidcentral.com/Report/SalesKpiEmployeeList`
- `GET {tenant}.maidcentral.com/Report/SalesKpiJson`

#### `/Report/SpotlightDashboard`

- Rendering: server-rendered + XHR · jquery 1.11.2
- `GET {tenant}.maidcentral.com/Home/Sidebar`

#### `/Compliance`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 1 table(s)
- `GET {tenant}.maidcentral.com/Compliance/CreateOrUpdateBreak/`
- `GET {tenant}.maidcentral.com/Home/Sidebar`

#### `/Report/RevenueProductionPlanning`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 1 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- Form `POST /Report/RevenueProductionPlanning`: `StartDate:text`, `EndDate:text`, `GroupById:select-one`, `ColumnOptionListSelected:checkbox`

#### `/Report/AvailabilityCalendarGroup`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 2 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `POST {tenant}.maidcentral.com/ServiceSetType/GetServiceTypeGroupAvailability`

#### `/Report/DispatchBoard?EndDate=:date&StartDate=:date`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 2 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- Form `POST /Report/DispatchBoard`: `StartDate:text`, `EndDate:text`, `JobStatusSelected:checkbox`, `ServiceSetTypeId:select-one`, `BillingTermsId:select-one`, `JobTagsSelected:checkbox`, `ServiceSetTagsSelected:checkbox`, `HomeTagsSelected:checkbox`, `CustomerTagsSelected:checkbox`, `dispatchBoardTable_length:select-one`

#### `/Report/MasterSchedule`

- Rendering: server-rendered + XHR · jquery 1.11.2
- `GET {tenant}.maidcentral.com/Home/Sidebar`

#### `/Report/CustomerStats`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 1 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `GET {tenant}.maidcentral.com/ProviderStatus/Current`

#### `/Report/RoutingSheet`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 2 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- Form `GET /Report/RoutingSheet`: `JobDate:text`

#### `/Report/HotSheet`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 1 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- Form `GET /Report/HotSheet`: `JobDate:text`

#### `/Report/HotSheetNew`

- Rendering: server-rendered + XHR · jquery 1.11.2
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- Form `POST /Report/HotSheetNew`: `StartDate:text`, `EndDate:text`, `JobStatusSelected:checkbox`, `ServiceSetTypeId:select-one`, `BillingTermsId:select-one`, `JobTagsSelected:checkbox`, `ServiceSetTagsSelected:checkbox`, `HomeTagsSelected:checkbox`, `CustomerTagsSelected:checkbox`

#### `/Report/ScorecardResults`

- Rendering: server-rendered + XHR · jquery 1.11.2
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `GET {tenant}.maidcentral.com/ProviderStatus/Current`
- Form `POST /Report/ScorecardResults`: `Start:text`, `End:text`, `OnlyShowResponses:checkbox`, `OnlyShowResponses:hidden`

#### `/Report/ContactTickets?MaxDateCreatedTimeFilter=:date&MinDateCreatedTimeFilter=:date`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 2 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- Form `GET /Report/ContactTickets`: `MinDateCreatedTimeFilter:hidden`, `MaxDateCreatedTimeFilter:hidden`, `Filter:text`

#### `/Report/ScheduleEfficiencyMap?EndDate=:date&StartDate=:date`

- Rendering: server-rendered + XHR · jquery 1.11.2
- `POST {tenant}.maidcentral.com/CspReport/Report (blocked: write)`
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `GET {tenant}.maidcentral.com/Zone/GetMapJson`
- `POST maps.googleapis.com/$rpc/google.internal.maps.mapsjs.v1.MapsJsInternalService/GetViewportInfo (blocked: write)`
- `GET maps.googleapis.com/maps/api/mapsjs/gen_204`
- `GET maps.googleapis.com/maps/api/mapsjs/mapConfigs:batchGet`
- Form `POST /Report/ScheduleEfficiencyMap`: `StartDate:hidden`, `EndDate:hidden`, `ServiceSetTypeGroupSelected:checkbox`, `TeamSelectListSelected:checkbox`

#### `/Report/CustomerEfficiencyMap`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 1 table(s)
- `POST {tenant}.maidcentral.com/CspReport/Report (blocked: write)`
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `GET {tenant}.maidcentral.com/ProviderStatus/Current`
- `GET {tenant}.maidcentral.com/Zone/GetMapJson`
- `POST maps.googleapis.com/$rpc/google.internal.maps.mapsjs.v1.MapsJsInternalService/GetViewportInfo (blocked: write)`
- `GET maps.googleapis.com/maps/api/mapsjs/gen_204`
- `GET maps.googleapis.com/maps/api/mapsjs/mapConfigs:batchGet`
- Form `POST /Report/CustomerEfficiencyMap`: `ServiceSetTypeGroupSelected:checkbox`, `ServiceFrequencySelectListSelected:checkbox`, `TeamSelectListSelected:checkbox`, `DayOfWeekSelectListSelected:checkbox`, `MapPinColor:radio`

#### `/Notification/DailyNotifications`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 1 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `GET {tenant}.maidcentral.com/ProviderStatus/Current`
- Form `POST /Notification/DailyNotifications`: `JobDate:text`, `ShowJobsOutsideNotificationWindow:checkbox`, `ShowJobsOutsideNotificationWindow:hidden`

#### `/Rates#tab-mods`

- Rendering: server-rendered + XHR · jquery 1.11.2
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `GET {tenant}.maidcentral.com/Rates/BulkRateModifications`
- Form `GET (same page)`: `TemplateTypeId:hidden`, `RateModificationId:select-one`, `StartDate:text`, `RateModificationBulkChangeType:radio`, `ZonesSelected:checkbox`, `BillingTermsId:select-one`, `ZipCodes:select-multiple`

#### `/Report/UtmReport?endDate=:date&startDate=:date`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 2 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- Form `GET /Report/UtmReport`: `dateFilterType:hidden`, `startDate:hidden`, `endDate:hidden`

#### `/Report/EmployeeStats?End=:date&Start=:date`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 1 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `POST {tenant}.maidcentral.com/Report/SaveDataTableState (blocked: write)`
- Form `POST /Report/EmployeeStats`: `IncludeTerminatedEmployees:checkbox`, `IncludeTerminatedEmployees:hidden`, `IncludeProductivity:checkbox`, `IncludeProductivity:hidden`, `Start:text`, `End:text`

#### `/Report/EmployeeList`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 1 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- Form `POST /Report/EmployeeList`: `ShowActive:checkbox`, `ShowActive:hidden`

#### `/Report/EmployeeTurnover`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 1 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`

#### `/Report/EmployeeProductivity`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 1 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`

#### `/Report/TeamMileage`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 1 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- Form `GET /Report/TeamMileage`: `StartDate:text`, `EndDate:text`, `GroupById:select-one`
- Form `POST /Payroll/TeamMileageSubmit`: `AdditionalPays[:id].TeamEfficiencyId:hidden`, `AdditionalPays[:id].JobDate:hidden`, `AdditionalPays[:id].TotalMilesPaid:hidden`, `AdditionalPays[:id].TotalMilesPaidText:hidden`, `AdditionalPays[:id].Create:checkbox`, `AdditionalPays[:id].Create:hidden`, `AdditionalPays[:id].ScheduledEmployeeSelected:select-one`, `AdditionalPays[:id].MileageRate:number`

#### `/Campaign/CreateAccountCustomerInvite`

- Rendering: server-rendered + XHR · jquery 1.11.2
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `GET {tenant}.maidcentral.com/ProviderStatus/Current`
- Form `POST /Campaign/CreateAccountCustomerInvite`: `ZoneSelectListSelected:checkbox`, `CustomerTagsSelected:checkbox`, `HomeTagsSelected:checkbox`, `BillingTermSelectListSelected:checkbox`, `Locked:select-one`, `AccountCreated:select-one`, `CreditCardAdded:select-one`, `PendingJobs:select-one`

#### `/Report/CustomerRetention`

- Rendering: server-rendered + XHR · jquery 1.11.2
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `GET {tenant}.maidcentral.com/ProviderStatus/Current`
- Form `POST /Report/CustomerRetention`: `ServiceSetTypeSelectListSelected:checkbox`, `ServiceFrequencySelectListSelected:checkbox`, `ZoneSelectListSelected:checkbox`, `LastJobStartDate:text`, `LastJobEndDate:text`, `StartPendingJobCount:number`, `EndPendingJobCount:number`, `Locked:select-one`, `SendQualitySurvey:select-one`, `IncludeLastNote:checkbox`, `IncludeLastNote:hidden`

#### `/Campaign/QuoteCampaign`

- Rendering: server-rendered + XHR · jquery 1.11.2 · anti-forgery field
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `GET {tenant}.maidcentral.com/ProviderStatus/Current`
- Form `POST /Campaign/QuoteCampaign`: `__RequestVerificationToken:hidden`, `Tags:text`, `QuoteStatusSelectListSelected:checkbox`, `ServiceSetTypeGroupId:select-one`, `CustomerSourceId:select-one`, `DateCreatedMin:text`, `DateCreatedMax:text`, `DateLastModifiedMin:text`, `DateLastModifiedMax:text`

#### `/Report/JobCampaign`

- Rendering: server-rendered + XHR · jquery 1.11.2
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `GET {tenant}.maidcentral.com/ProviderStatus/Current`
- Form `POST /Report/JobCampaign`: `StartDate:text`, `EndDate:text`, `JobStatusSelected:checkbox`, `ServiceSetTypeId:select-one`, `ZoneSelectListSelected:checkbox`

#### `/Campaign/Employee`

- Rendering: server-rendered + XHR · jquery 1.11.2
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `GET {tenant}.maidcentral.com/ProviderStatus/Current`
- Form `POST /Campaign/Employee`: `EmployeeTagsSelected:checkbox`, `SkillsSelected:checkbox`, `HireStartDate:text`, `HireEndDate:text`, `CreatedStartDate:text`, `CreatedEndDate:text`, `TerminationStartDate:text`, `TerminationEndDate:text`, `AccountCreated:select-one`, `ShowTerminated:select-one`

#### `/Campaign`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 2 table(s)
- `GET {tenant}.maidcentral.com/Campaign/GetManualCampaignHistory`
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `GET {tenant}.maidcentral.com/ProviderStatus/Current`

#### `/Company/Settings`

- Rendering: server-rendered + XHR · jquery 1.11.2 · anti-forgery field
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `GET {tenant}.maidcentral.com/ProviderStatus/Current`
- `GET maps.googleapis.com/maps/api/mapsjs/gen_204`
- Form `POST /Company/SettingsGeneral`: `__RequestVerificationToken:hidden`, `ServiceCompanyId:hidden`, `ServiceCompanyName:text`, `ServiceCompanyAbbreviation:text`, `TimeZoneInfoId:select-one`, `BusinessHoursStart:text`, `BusinessHoursEnd:text`, `DailyNotificationTime:text`, `NotificationWindowStart:number`, `NotificationWindowEnd:number`, `TextNotificationEmails:text`, `TextNotificationDelaySeconds:number`, `WeekInReviewEmails:text`, `ScheduleAllowedUnexcusedDays:number`, `ScheduleEmergencyHours:number`, `ScheduleTardiesEqualUnexcused:number`, `ScheduleLateGracePeriodMinutes:number`, `ScheduleStartUpTime:text`, `ScheduleWrapUpTime:text`, `TechDashboardVisibleTime:number`, `TechCheckInWarningText:textarea`, `ScheduleShowRightBar:checkbox`, `ScheduleShowRightBar:hidden`, `ScheduleHightlightAvailability:checkbox`, `ScheduleHightlightAvailability:hidden`, `ScheduleShowBusinessHours:checkbox`, `ScheduleShowBusinessHours:hidden`, `ScheduleSnapToGrid:checkbox`, `ScheduleSnapToGrid:hidden`, `ScheduleDefaultView:select-one`, `ScheduleBackgroundColor:text`
- Form `POST /Company/SettingsIntegrations`: `__RequestVerificationToken:hidden`, `ServiceCompanyId:hidden`, `StripePublishableKey:text`, `StripeSecretKey:password`, `TwilioAccountSid:text`, `TwilioAuthToken:password`, `TwilioPhoneNumber:text`, `TwilioCallerIdPhoneNumber:text`, `TwilioSmartEncode:checkbox`, `TwilioSmartEncode:hidden`, `KeapClientId:text`, `KeapClientSecret:password`, `KeapSupportEmail:text`
- Form `POST /Company/SettingsAddresses`: `__RequestVerificationToken:hidden`, `ServiceCompanyId:hidden`, `mycustomfield:text`, `:token:text`, `ServiceCompanyMailingCity:text`, `ServiceCompanyMailingRegion:text`, `ServiceCompanyMailingPostalCode:text`, `ServiceCompanyMailingCountry:text`, `myothercustomfield:text`, `ServiceCompanyPhysicalCity:text`, `ServiceCompanyPhysicalRegion:text`, `ServiceCompanyPhysicalPostalCode:text`, `ServiceCompanyPhysicalCountry:text`
- Form `POST /Company/SettingsLogoUI`: `ServiceCompanyId:hidden`, `__RequestVerificationToken:hidden`, `TopBarColor:text`, `file:file`, `fileDark:file`, `ServiceCompanyFullName:text`, `PublicPhoneNumber:text`, `PublicPhoneNumberSales:text`, `DefaultGlobalTemplateId:select-one`, `PublicEmail:text`, `PublicEmailSales:text`, `PublicWebsiteUrl:text`, `MaidServiceQuoteUrl:text`, `FacebookProfileUrl:text`, `InstagramUrl:text`, `YelpUrl:text`, `GoogleBusinessUrl:text`, `AngiesListUrl:text`, `PublicLogoImageUrl:text`, `PublicMastheadImageUrl:text`, `TermsOfServiceUrl:url`, `PrivacyPolicyUrl:url`, `FooterAbout:textarea`
- Form `POST /Company/UpdateKioskAccount`: `Password:password`
- Form `POST /Company/SettingsPayroll`: `__RequestVerificationToken:hidden`, `ServiceCompanyId:hidden`, `PayrollWeeks:hidden`, `PayrollStartDayOfWeek:select-one`, `FullTimeHours:text`, `CaptainTraineePercent:text`, `CaptainTraineeDollar:text`, `EmployeeStartTime:text`, `MinimumWage:text`, `MinimumWageDaily:text`, `TraineePay:text`, `MileageRate:text`
- Form `POST /Company/KeapAccessToken`: `KeapAccessToken:text`

#### `/User`

- Rendering: server-rendered + XHR · jquery 1.11.2 · anti-forgery field · 1 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- Form `POST /Employee/LockEmployeeAccount`: `__RequestVerificationToken:hidden`

#### `/EmailTemplate`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 1 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- Form `POST /EmailTemplate`: `EmailTemplateGroupSelectListSelected:checkbox`, `EmailTemplateMediumSelectListSelected:checkbox`

#### `/Survey`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 1 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`

#### `/Invoicing?JobDate=:date`

- Rendering: server-rendered + XHR · jquery 1.11.2, signalR
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `GET {tenant}.maidcentral.com/ProviderStatus/Current`
- `GET {tenant}.maidcentral.com/signalr/negotiate`
- `GET {tenant}.maidcentral.com/signalr/start`
- `GET maps.googleapis.com/maps/api/mapsjs/gen_204`
- Form `POST /Invoicing`: `JobDate:hidden`, `ServiceCompanyId:hidden`

#### `/Team`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 1 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`

#### `/Settings/Offices#tab_offices`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 1 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `POST {tenant}.maidcentral.com/Settings/CreateOrUpdateOffice (blocked: write)`
- `GET {tenant}.maidcentral.com/Settings/OfficesPartial`

#### `/Room`

- Rendering: server-rendered + XHR · jquery 1.11.2 · anti-forgery field · 1 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- Form `POST /Room/CreateRoom`: `__RequestVerificationToken:hidden`, `RoomName:text`, `TypeId:select-one`

#### `/Settings#tab_general`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 1 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `GET {tenant}.maidcentral.com/Settings/General`
- `POST {tenant}.maidcentral.com/Settings/GetIFrameCode`
- Form `GET (same page)`: `QuotingDefaultInternalServiceSetTypeGroupId:select-one`, `QuotingDefaultExternalServiceSetTypeGroupId:select-one`, `DisplayZipCodeCheck:checkbox`, `DisplayManualAddressInputs:checkbox`, `PriceRoundingDecimalPlace:hidden`, `PriceRoundingDigit:hidden`

#### `/Zone`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 1 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`

#### `/ServiceCompanyGroup/Authorization`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 1 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `POST {tenant}.maidcentral.com/ServiceCompanyGroup/ShowAccessHistory`
- `GET {tenant}.maidcentral.com/view-resources/Views/ServiceCompanyGroup/_AccessHistoryModal.js`
- Form `POST /ServiceCompanyGroup/UpdateAuthorization`: `Users[:id].UserId:hidden`, `Users[:id].Email:hidden`, `Users[:id].EmployeeName:hidden`, `Users[:id].HasAccess:checkbox`

#### `/Settings/Partner#tab_billing`

- Rendering: server-rendered + XHR · jquery 1.11.2
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `GET {tenant}.maidcentral.com/Settings/PartnerBilling`
- `POST {tenant}.maidcentral.com/Settings/PartnerHolidaysCalendar`

#### `/Settings/Partner#tab_invoices`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 4 table(s)
- `POST {tenant}.maidcentral.com/Settings/CreateOrUpdateContactSubTypeModal (blocked: write)`
- `GET {tenant}.maidcentral.com/Settings/PartnerBilling`
- `GET {tenant}.maidcentral.com/Settings/PartnerInvoices`
- Form `POST /Settings/PartnerUiUpdate`: `file:file`, `leftLoginFile:file`, `PrimaryColor:text`, `ResourceLinkUrl:text`, `GoogleAnalyticsKey:text`, `GoogleAnalyticsDomains:text`

#### `/CustomerSource`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 1 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `GET {tenant}.maidcentral.com/ProviderStatus/Current`

#### `/Skill`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 1 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`

#### `/Tag`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 1 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`

#### `/ServiceCompanyGroup/Policies`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 1 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `GET {tenant}.maidcentral.com/ServiceCompanyGroup/CreateOrUpdatePolicy/`

#### `/Employee/Profile`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 3 table(s)
- `GET {tenant}.maidcentral.com/Employee/CalendarDayAvailability`
- `GET {tenant}.maidcentral.com/Employee/CreateOrUpdateScheduleRequest`
- `GET {tenant}.maidcentral.com/Employee/EmployeeScheduleRequests`
- `GET {tenant}.maidcentral.com/Employee/EmployeeScheduleRequestsModal`
- `POST {tenant}.maidcentral.com/Employee/GetAttendance`
- `POST {tenant}.maidcentral.com/Employee/PtoHistoryModal (blocked: write)`
- `POST {tenant}.maidcentral.com/Employee/Stats`
- `GET {tenant}.maidcentral.com/Home/Sidebar`

#### `/Error/NotFound?aspxerrorpath=*`

- Rendering: server-rendered
- (no XHR/fetch calls)

#### `/Report/Tickets`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 1 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `POST {tenant}.maidcentral.com/report/getTickets`
- Form `GET (same page)`: `StatusSelected:radio`, `TypesSelected:checkbox`

#### `/Customer/Details/:id?cid=:id`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 4 table(s)
- `POST {tenant}.maidcentral.com/Customer/Jobs`
- `GET {tenant}.maidcentral.com/Customer/Stats/:id`
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `GET {tenant}.maidcentral.com/HomeInformation/Homes`
- `GET {tenant}.maidcentral.com/ProviderStatus/Current`

#### `/Estimate/Details/:id`

- Rendering: server-rendered + XHR · jquery 1.11.2
- `GET {tenant}.maidcentral.com/Customer/EditTicket/`
- `POST {tenant}.maidcentral.com/Estimate/CampaignHistory`
- `POST {tenant}.maidcentral.com/Estimate/QuoteDetailsForGroups`
- `POST {tenant}.maidcentral.com/Estimate/QuoteNotes`
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `POST {tenant}.maidcentral.com/Note/GetNoteModal`
- `POST {tenant}.maidcentral.com/Quote/GetStatusSteps`
- `POST {tenant}.maidcentral.com/Template/GetTemplatesByType`
- `GET {tenant}.maidcentral.com/view-resources/Views/Note/_NoteModal.js`

#### `/Customer/CustomerServiceRequests`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 1 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `GET {tenant}.maidcentral.com/ProviderStatus/Current`

#### `/#sidebar_tab_customer`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 5 table(s)
- `GET {tenant}.maidcentral.com/Customer/EditTicket/`
- `GET {tenant}.maidcentral.com/Home/CustomerServiceRequests/`
- `GET {tenant}.maidcentral.com/Home/GetChartData/`
- `GET {tenant}.maidcentral.com/Home/NewCustomersWidget`
- `GET {tenant}.maidcentral.com/Home/OpenContactTickets`
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `GET {tenant}.maidcentral.com/report/bidata`

#### `/#sidebar_tab_employees`

- Rendering: server-rendered · jquery 1.11.2 · anti-forgery field · 5 table(s)
- (no XHR/fetch calls)
- Form `POST /Customer/EditTicket`: `__RequestVerificationToken:hidden`, `Id:hidden`, `TicketTypeId:hidden`, `OpenDate:text`, `CloseNotes:textarea`, `btnCloseTicket:submit`

#### `/Employee/Details/:id`

- Rendering: server-rendered + XHR · jquery 1.11.2 · anti-forgery field · 5 table(s)
- `GET {tenant}.maidcentral.com/Employee/EmployeeScheduleRequests`
- `GET {tenant}.maidcentral.com/Employee/GetEmployeeHistory/:id`
- `POST {tenant}.maidcentral.com/Employee/Stats`
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `GET maps.googleapis.com/maps/api/mapsjs/gen_204`
- Form `POST /Employee/Details/:id`: `__RequestVerificationToken:hidden`, `EmployeeInformationID:hidden`, `Prefix:text`, `FirstName:text`, `MiddleName:text`, `LastName:text`, `HireDate:text`, `TerminationDate:text`, `DriversLicenseNumber:text`, `DriversLicenseNumberState:text`, `CustomEmployeeId:text`, `Bio:textarea`, `EmergencyContactName:text`, `EmergencyContactPhone:text`, `InternalMemo:textarea`, `mycustomfield:text`, `MailingAddress:id:text`, `MailingCountry:hidden`, `MailingCity:text`, `MailingRegion:text`, `MailingPostalCode:text`, `myothercustomfield:text`, `PhysicalAddress:id:text`, `PhysicalCountry:hidden`, `PhysicalCity:text`, `PhysicalRegion:text`, `PhysicalPostalCode:text`, `FederalTaxCredits:text`, `StateTaxCredits:text`, `MaritalStatusId:select-one`, `Withholdings:text`, `DateOfBirth:text`, `ServiceCompanyGroupPolicyId:select-one`, `ServiceCompanyIncentivePayModelId:select-one`, `HourlyRate:text`, `MaxHourlyRate:text`, `MinimumWageRate:text`, `Salary:text`, `:token:select-one`
- Form `POST /Employee/UpdateRoles`: `__RequestVerificationToken:hidden`, `UserId:hidden`, `RolesSelected:checkbox`, `RolePermissionsSelected:checkbox`, `IsTwoFactorEnabled:checkbox`, `IsTwoFactorEnabled:hidden`, `PhoneNumber:text`
- Form `POST /Employee/EditProfilePhoto`: `EmployeeInformationID:hidden`, `ProfilePicture:file`

#### `/Home#sidebar_tab_customer`

- Rendering: server-rendered · jquery 1.11.2 · anti-forgery field · 5 table(s)
- (no XHR/fetch calls)
- Form `POST /Customer/EditTicket`: `__RequestVerificationToken:hidden`, `Id:hidden`, `TicketTypeId:hidden`, `OpenDate:text`, `CloseNotes:textarea`, `btnCloseTicket:submit`

#### `/Home#sidebar_tab_employees`

- Rendering: server-rendered · jquery 1.11.2 · anti-forgery field · 5 table(s)
- (no XHR/fetch calls)
- Form `POST /Customer/EditTicket`: `__RequestVerificationToken:hidden`, `Id:hidden`, `TicketTypeId:hidden`, `OpenDate:text`, `CloseNotes:textarea`, `btnCloseTicket:submit`

#### `/Home/SalesDashboardSettings`

- Rendering: server-rendered
- (no XHR/fetch calls)
- Form `POST /Home/SalesDashboardSettings`: `ServiceCompanyGroupId:hidden`, `ContactAttemps:number`, `ContactDefaultSortId:select-one`, `ContactMinHours:number`, `ContactMaxHours:number`, `FollowUpAttempts:number`, `FollowUpDefaultSortId:select-one`, `FollowUpMinHours:number`, `FollowUpMaxHours:number`

#### `/Report/KioskSettings`

- Rendering: server-rendered · 1 table(s)
- (no XHR/fetch calls)
- Form `POST /Report/KioskSettings`: `RedirectTo:hidden`, `Model.ServiceSet[:id].ServiceSetTypeId:hidden`, `Model.ServiceSet[:id].IsSelected:checkbox`, `Model.ServiceSet[:id].IsSelected:hidden`

#### `/Home/SalesDashboard#tab_main`

- Rendering: server-rendered + XHR · jquery 1.11.2
- `GET {tenant}.maidcentral.com/Home/SalesExternalFormQuotes`
- `GET {tenant}.maidcentral.com/Home/SalesOpenNotes`
- `GET {tenant}.maidcentral.com/Home/SalesQuotesAction`
- `GET {tenant}.maidcentral.com/Home/SalesServiceRequests`
- `GET {tenant}.maidcentral.com/Home/Sidebar`

#### `/Home/SalesDashboard#tab_sales`

- Rendering: server-rendered · jquery 1.11.2
- (no XHR/fetch calls)

#### `/Home/SalesDashboard#sidebar_tab_customer`

- Rendering: server-rendered + XHR · jquery 1.11.2
- `GET {tenant}.maidcentral.com/Home/SalesExternalFormQuotes`
- `GET {tenant}.maidcentral.com/Home/SalesOpenNotes`
- `GET {tenant}.maidcentral.com/Home/SalesQuotesAction`
- `GET {tenant}.maidcentral.com/Home/SalesServiceRequests`
- `GET {tenant}.maidcentral.com/Home/Sidebar`

#### `/Home/SalesDashboard#sidebar_tab_employees`

- Rendering: server-rendered · jquery 1.11.2
- (no XHR/fetch calls)

#### `/Estimate/SalesPipeline?=:date#sidebar_tab_customer`

- Rendering: server-rendered · jquery 1.11.2, signalR
- (no XHR/fetch calls)
- Form `GET (same page)`: (no fields)

#### `/Estimate/SalesPipeline?=:date#sidebar_tab_employees`

- Rendering: server-rendered · jquery 1.11.2, signalR
- (no XHR/fetch calls)
- Form `GET (same page)`: (no fields)

#### `/Communication?id=:id&info=*&typeId=:id#sidebar_tab_customer`

- Rendering: server-rendered · jquery 1.11.2
- (no XHR/fetch calls)

#### `/Communication?id=:id&info=*&typeId=:id#sidebar_tab_employees`

- Rendering: server-rendered · jquery 1.11.2
- (no XHR/fetch calls)

#### `/ChangeLog`

- Rendering: server-rendered + XHR · jquery 1.11.2
- `GET {tenant}.maidcentral.com/Home/Sidebar`

#### `/Dashboard/Index/:id#sidebar_tab_customer`

- Rendering: server-rendered + XHR · jquery 1.11.2, signalR · 4 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`

#### `/Dashboard/Index/:id#sidebar_tab_employees`

- Rendering: server-rendered · jquery 1.11.2, signalR · 4 table(s)
- (no XHR/fetch calls)

#### `/Employee/Create#sidebar_tab_customer`

- Rendering: server-rendered · jquery 1.11.2 · anti-forgery field
- (no XHR/fetch calls)
- Form `POST /Employee/Create`: `__RequestVerificationToken:hidden`, `Role:hidden`, `Prefix:text`, `FirstName:text`, `MiddleName:text`, `LastName:text`, `HireDate:text`, `DriversLicenseNumber:text`, `DriversLicenseNumberState:text`, `AddScheduleTag:checkbox`, `AddScheduleTag:hidden`, `EmergencyContactName:text`, `EmergencyContactPhone:text`, `FirstContactTypeId:select-one`, `FirstContactInfo:text`, `Email:email`, `RolesSelected:checkbox`, `mycustomfield:text`, `MailingAddress:id:text`, `MailingCountry:hidden`, `MailingCity:text`, `MailingRegion:text`, `MailingPostalCode:text`, `PhysicalSameAsMailing:checkbox`, `PhysicalSameAsMailing:hidden`, `myothercustomfield:text`, `PhysicalAddress:id:text`, `PhysicalCountry:hidden`, `PhysicalCity:text`, `PhysicalRegion:text`, `PhysicalPostalCode:text`, `FederalTaxCredits:text`, `StateTaxCredits:text`, `MaritalStatusId:select-one`, `Withholdings:text`, `DateOfBirth:text`, `ServiceCompanyGroupPolicyId:select-one`, `Salary:text`, `HourlyRate:text`, `MinimumWageRate:text`, `MaxHourlyRate:text`

#### `/Employee/Create#sidebar_tab_employees`

- Rendering: server-rendered · jquery 1.11.2 · anti-forgery field
- (no XHR/fetch calls)
- Form `POST /Employee/Create`: `__RequestVerificationToken:hidden`, `Role:hidden`, `Prefix:text`, `FirstName:text`, `MiddleName:text`, `LastName:text`, `HireDate:text`, `DriversLicenseNumber:text`, `DriversLicenseNumberState:text`, `AddScheduleTag:checkbox`, `AddScheduleTag:hidden`, `EmergencyContactName:text`, `EmergencyContactPhone:text`, `FirstContactTypeId:select-one`, `FirstContactInfo:text`, `Email:email`, `RolesSelected:checkbox`, `mycustomfield:text`, `MailingAddress:id:text`, `MailingCountry:hidden`, `MailingCity:text`, `MailingRegion:text`, `MailingPostalCode:text`, `PhysicalSameAsMailing:checkbox`, `PhysicalSameAsMailing:hidden`, `myothercustomfield:text`, `PhysicalAddress:id:text`, `PhysicalCountry:hidden`, `PhysicalCity:text`, `PhysicalRegion:text`, `PhysicalPostalCode:text`, `FederalTaxCredits:text`, `StateTaxCredits:text`, `MaritalStatusId:select-one`, `Withholdings:text`, `DateOfBirth:text`, `ServiceCompanyGroupPolicyId:select-one`, `Salary:text`, `HourlyRate:text`, `MinimumWageRate:text`, `MaxHourlyRate:text`

#### `/Employee#sidebar_tab_customer`

- Rendering: server-rendered · jquery 1.11.2 · anti-forgery field · 1 table(s)
- (no XHR/fetch calls)
- Form `GET /Employee`: `TagsSelected:checkbox`, `SkillsSelected:checkbox`, `ShowTerminated:checkbox`, `ShowTerminated:hidden`
- Form `POST /Employee/LockEmployeeAccount`: `__RequestVerificationToken:hidden`

#### `/Employee#sidebar_tab_employees`

- Rendering: server-rendered · jquery 1.11.2 · anti-forgery field · 1 table(s)
- (no XHR/fetch calls)
- Form `GET /Employee`: `TagsSelected:checkbox`, `SkillsSelected:checkbox`, `ShowTerminated:checkbox`, `ShowTerminated:hidden`
- Form `POST /Employee/LockEmployeeAccount`: `__RequestVerificationToken:hidden`

#### `/Employee/Time#jobs-tab`

- Rendering: server-rendered · knockout, jquery 1.11.2, kendo · 20 table(s)
- (no XHR/fetch calls)
- Form `POST /Time/ExportTimeClockData`: `StartDate:text`, `EndDate:text`, `ExportTypes:checkbox`

#### `/Employee/Time#timeclocks-tab`

- Rendering: server-rendered + XHR · knockout, jquery 1.11.2, kendo · 20 table(s)
- `POST {tenant}.maidcentral.com/report/getTimeChangeRequests`
- Form `POST /Time/ExportTimeClockData`: `StartDate:text`, `EndDate:text`, `ExportTypes:checkbox`

#### `/Employee/Time#events-tab`

- Rendering: server-rendered + XHR · knockout, jquery 1.11.2, kendo · 20 table(s)
- `GET {tenant}.maidcentral.com/Employee/EmployeeMonitorData`
- `POST {tenant}.maidcentral.com/Event/Events`
- Form `POST /Time/ExportTimeClockData`: `StartDate:text`, `EndDate:text`, `ExportTypes:checkbox`

#### `/Employee/Time#breaks-tab`

- Rendering: server-rendered + XHR · knockout, jquery 1.11.2, kendo · 20 table(s)
- `GET {tenant}.maidcentral.com/Employee/GetEmployeeBreaks`
- `POST {tenant}.maidcentral.com/Event/Events`
- Form `POST /Time/ExportTimeClockData`: `StartDate:text`, `EndDate:text`, `ExportTypes:checkbox`

#### `/Employee/Time#requests-tab`

- Rendering: server-rendered + XHR · knockout, jquery 1.11.2, kendo · 20 table(s)
- `POST {tenant}.maidcentral.com/report/getTimeChangeRequests`
- Form `POST /Time/ExportTimeClockData`: `StartDate:text`, `EndDate:text`, `ExportTypes:checkbox`

#### `/HomeInformation/Details/:id?cid=:id&hsid=:id#tab_service`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 6 table(s)
- `GET {tenant}.maidcentral.com/HomeInformation/ScorecardPartial`
- `GET {tenant}.maidcentral.com/rates/GetRatesByServiceSetInformationId`

#### `/Job/Worksheet/:id`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 1 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `GET {tenant}.maidcentral.com/Job/CheckNextJobNotificationOnWay`
- `GET {tenant}.maidcentral.com/Job/GetContactTicketModal/`
- `GET {tenant}.maidcentral.com/Job/RateModificationsByJob`
- `GET {tenant}.maidcentral.com/Job/TechNotesPartial/`
- `GET {tenant}.maidcentral.com/ProviderStatus/Current`
- `POST {tenant}.maidcentral.com/Time/GetAllTimeChangeRequestsForEmployee`

#### `/Employee/Time#sidebar_tab_customer`

- Rendering: server-rendered + XHR · jquery 1.11.2, kendo · 20 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `GET maps.googleapis.com/maps/api/mapsjs/gen_204`
- Form `POST /Time/ExportTimeClockData`: `StartDate:text`, `EndDate:text`, `ExportTypes:checkbox`

#### `/Employee/Time#sidebar_tab_employees`

- Rendering: server-rendered · jquery 1.11.2, kendo · 20 table(s)
- (no XHR/fetch calls)
- Form `POST /Time/ExportTimeClockData`: `StartDate:text`, `EndDate:text`, `ExportTypes:checkbox`

#### `/Company/BroadcastMessage#sidebar_tab_customer`

- Rendering: server-rendered · jquery 1.11.2 · anti-forgery field
- (no XHR/fetch calls)
- Form `POST /Company/BroadcastMessage`: `__RequestVerificationToken:hidden`, `ConfirmedToSend:hidden`, `ServiceCompaniesSelected[:id]:hidden`, `Medium:radio`, `Subject:text`, `From:email`, `Message:textarea`

#### `/Company/BroadcastMessage#sidebar_tab_employees`

- Rendering: server-rendered · jquery 1.11.2 · anti-forgery field
- (no XHR/fetch calls)
- Form `POST /Company/BroadcastMessage`: `__RequestVerificationToken:hidden`, `ConfirmedToSend:hidden`, `ServiceCompaniesSelected[:id]:hidden`, `Medium:radio`, `Subject:text`, `From:email`, `Message:textarea`

#### `/Schedule#sidebar_tab_customer`

- Rendering: server-rendered + XHR · knockout, jquery 1.11.2, kendo · 5 table(s)
- `POST {tenant}.maidcentral.com/Schedule/AbsentEmployees/`

#### `/Schedule#sidebar_tab_employees`

- Rendering: server-rendered · knockout, jquery 1.11.2, kendo · anti-forgery field · 5 table(s)
- (no XHR/fetch calls)
- Form `POST /Schedule/EditSchedulerItemDetails`: `__RequestVerificationToken:hidden`, `EmployeeTeamScheduleId:hidden`, `EmployeeInformationId:select-one`, `ScheduleDate:text`, `StartTime:text`, `EndDate:text`, `EndTime:text`, `OutCode:select-one`, `TeamId:select-one`, `TeamPositionId:select-one`, `Late:checkbox`, `Late:hidden`, `Reason:textarea`, `command:submit`

#### `/Schedule?Date=:date`

- Rendering: server-rendered + XHR · knockout, jquery 1.11.2, kendo · 5 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `POST {tenant}.maidcentral.com/Job/CustomerEmployeeFlags/`
- `POST {tenant}.maidcentral.com/Schedule/AbsentEmployees/`
- `GET {tenant}.maidcentral.com/Schedule/GetSchedulerItemDetails`
- `GET {tenant}.maidcentral.com/Schedule/Read`
- `GET {tenant}.maidcentral.com/Schedule/ReadEmployees`
- `GET {tenant}.maidcentral.com/Schedule/ReadTeamPositions`
- `GET {tenant}.maidcentral.com/Schedule/ReadTeams`

#### `/Company/ScheduleExceptions#tab_calendar`

- Rendering: server-rendered · jquery 1.11.2 · 4 table(s)
- (no XHR/fetch calls)
- Form `POST /Employee/ScheduleRequests`: `StartDate:text`, `EndDate:text`
- Form `POST /Company/ScheduleExceptions`: `DefaultAvailableDays:hidden`, `btnUpdateDates:submit`, `Model.StartDate:text`, `Model.EndDate:text`, `Model.Exceptions[:id].EmployeeScheduleExceptionId:hidden`, `Model.Exceptions[:id].ScheduleDate:hidden`, `Model.Exceptions[:id].BlackoutDay:checkbox`, `Model.Exceptions[:id].BlackoutDay:hidden`, `Model.Exceptions[:id].Note:text`

#### `/Company/ScheduleExceptions#tab_requests`

- Rendering: server-rendered · jquery 1.11.2 · 4 table(s)
- (no XHR/fetch calls)
- Form `POST /Employee/ScheduleRequests`: `StartDate:text`, `EndDate:text`
- Form `POST /Company/ScheduleExceptions`: `DefaultAvailableDays:hidden`, `btnUpdateDates:submit`, `Model.StartDate:text`, `Model.EndDate:text`, `Model.Exceptions[:id].EmployeeScheduleExceptionId:hidden`, `Model.Exceptions[:id].ScheduleDate:hidden`, `Model.Exceptions[:id].BlackoutDay:checkbox`, `Model.Exceptions[:id].BlackoutDay:hidden`, `Model.Exceptions[:id].Note:text`

#### `/Company/ScheduleExceptions#tab_table`

- Rendering: server-rendered · jquery 1.11.2 · 4 table(s)
- (no XHR/fetch calls)
- Form `POST /Employee/ScheduleRequests`: `StartDate:text`, `EndDate:text`
- Form `POST /Company/ScheduleExceptions`: `DefaultAvailableDays:hidden`, `btnUpdateDates:submit`, `Model.StartDate:text`, `Model.EndDate:text`, `Model.Exceptions[:id].EmployeeScheduleExceptionId:hidden`, `Model.Exceptions[:id].ScheduleDate:hidden`, `Model.Exceptions[:id].BlackoutDay:checkbox`, `Model.Exceptions[:id].BlackoutDay:hidden`, `Model.Exceptions[:id].Note:text`

#### `/Company/ScheduleExceptions#sidebar_tab_customer`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 4 table(s)
- `POST {tenant}.maidcentral.com/Company/ScheduleExceptionCalendar`
- `GET {tenant}.maidcentral.com/Employee/CalendarDayAvailability`
- `GET {tenant}.maidcentral.com/Employee/ScheduleRequests`
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `GET {tenant}.maidcentral.com/ProviderStatus/Current`
- Form `POST /Employee/ScheduleRequests`: `StartDate:text`, `EndDate:text`
- Form `POST /Company/ScheduleExceptions`: `DefaultAvailableDays:hidden`, `btnUpdateDates:submit`, `Model.StartDate:text`, `Model.EndDate:text`, `Model.Exceptions[:id].EmployeeScheduleExceptionId:hidden`, `Model.Exceptions[:id].ScheduleDate:hidden`, `Model.Exceptions[:id].BlackoutDay:checkbox`, `Model.Exceptions[:id].BlackoutDay:hidden`, `Model.Exceptions[:id].Note:text`

#### `/Company/ScheduleExceptions#sidebar_tab_employees`

- Rendering: server-rendered · jquery 1.11.2 · 4 table(s)
- (no XHR/fetch calls)
- Form `POST /Employee/ScheduleRequests`: `StartDate:text`, `EndDate:text`
- Form `POST /Company/ScheduleExceptions`: `DefaultAvailableDays:hidden`, `btnUpdateDates:submit`, `Model.StartDate:text`, `Model.EndDate:text`, `Model.Exceptions[:id].EmployeeScheduleExceptionId:hidden`, `Model.Exceptions[:id].ScheduleDate:hidden`, `Model.Exceptions[:id].BlackoutDay:checkbox`, `Model.Exceptions[:id].BlackoutDay:hidden`, `Model.Exceptions[:id].Note:text`

#### `/Customer/Create#tab1`

- Rendering: server-rendered · jquery 1.11.2 · anti-forgery field
- (no XHR/fetch calls)
- Form `POST /Customer/Create`: `__RequestVerificationToken:hidden`, `CustomerQuoteDetailLineId:hidden`, `CustomerFirstName:text`, `CustomerMiddleName:text`, `CustomerLastName:text`, `CustomerTagsSelected:checkbox`, `CustomerCompanyName:text`, `BillingTermsId:select-one`, `CustomerSourceId:select-one`, `EmailInvoice:checkbox`, `EmailInvoice:hidden`, `mycustomfield:text`, `BillingAddress:id:text`, `BillingCountry:hidden`, `BillingCity:text`, `BillingState:text`, `BillingZip:text`, `FirstContactTypeId:select-one`, `FirstContactInfo:text`, `SecondContactTypeId:select-one`, `SecondContactInfo:text`, `HomeAddressSameAsBilling:checkbox`, `HomeAddressSameAsBilling:hidden`, `myothercustomfield:text`, `HomeAddress:id:text`, `HomeCountry:hidden`, `HomeCity:text`, `HomeState:text`, `HomeZip:text`, `HomeSubdivision:text`, `HomeName:text`, `HomeLocationPhone:text`, `HomeServiceTagsSelected:checkbox`, `HomeSpecialInstructions:textarea`, `HomePetInstructions:textarea`, `HomeDirections:textarea`, `HomeSpecialEquipment:textarea`, `HomeWasteDisposal:textarea`, `HomeAcessInformation:textarea`, `HomeInternalMemo:textarea`

#### `/Customer/Create#tab2`

- Rendering: server-rendered · jquery 1.11.2 · anti-forgery field
- (no XHR/fetch calls)
- Form `POST /Customer/Create`: `__RequestVerificationToken:hidden`, `CustomerQuoteDetailLineId:hidden`, `CustomerFirstName:text`, `CustomerMiddleName:text`, `CustomerLastName:text`, `CustomerTagsSelected:checkbox`, `CustomerCompanyName:text`, `BillingTermsId:select-one`, `CustomerSourceId:select-one`, `EmailInvoice:checkbox`, `EmailInvoice:hidden`, `mycustomfield:text`, `BillingAddress:id:text`, `BillingCountry:hidden`, `BillingCity:text`, `BillingState:text`, `BillingZip:text`, `FirstContactTypeId:select-one`, `FirstContactInfo:text`, `SecondContactTypeId:select-one`, `SecondContactInfo:text`, `HomeAddressSameAsBilling:checkbox`, `HomeAddressSameAsBilling:hidden`, `myothercustomfield:text`, `HomeAddress:id:text`, `HomeCountry:hidden`, `HomeCity:text`, `HomeState:text`, `HomeZip:text`, `HomeSubdivision:text`, `HomeName:text`, `HomeLocationPhone:text`, `HomeServiceTagsSelected:checkbox`, `HomeSpecialInstructions:textarea`, `HomePetInstructions:textarea`, `HomeDirections:textarea`, `HomeSpecialEquipment:textarea`, `HomeWasteDisposal:textarea`, `HomeAcessInformation:textarea`, `HomeInternalMemo:textarea`

#### `/Customer/Create#tab3`

- Rendering: server-rendered · jquery 1.11.2 · anti-forgery field
- (no XHR/fetch calls)
- Form `POST /Customer/Create`: `__RequestVerificationToken:hidden`, `CustomerQuoteDetailLineId:hidden`, `CustomerFirstName:text`, `CustomerMiddleName:text`, `CustomerLastName:text`, `CustomerTagsSelected:checkbox`, `CustomerCompanyName:text`, `BillingTermsId:select-one`, `CustomerSourceId:select-one`, `EmailInvoice:checkbox`, `EmailInvoice:hidden`, `mycustomfield:text`, `BillingAddress:id:text`, `BillingCountry:hidden`, `BillingCity:text`, `BillingState:text`, `BillingZip:text`, `FirstContactTypeId:select-one`, `FirstContactInfo:text`, `SecondContactTypeId:select-one`, `SecondContactInfo:text`, `HomeAddressSameAsBilling:checkbox`, `HomeAddressSameAsBilling:hidden`, `myothercustomfield:text`, `HomeAddress:id:text`, `HomeCountry:hidden`, `HomeCity:text`, `HomeState:text`, `HomeZip:text`, `HomeSubdivision:text`, `HomeName:text`, `HomeLocationPhone:text`, `HomeServiceTagsSelected:checkbox`, `HomeSpecialInstructions:textarea`, `HomePetInstructions:textarea`, `HomeDirections:textarea`, `HomeSpecialEquipment:textarea`, `HomeWasteDisposal:textarea`, `HomeAcessInformation:textarea`, `HomeInternalMemo:textarea`

#### `/Customer/Create#tab4`

- Rendering: server-rendered · jquery 1.11.2 · anti-forgery field
- (no XHR/fetch calls)
- Form `POST /Customer/Create`: `__RequestVerificationToken:hidden`, `CustomerQuoteDetailLineId:hidden`, `CustomerFirstName:text`, `CustomerMiddleName:text`, `CustomerLastName:text`, `CustomerTagsSelected:checkbox`, `CustomerCompanyName:text`, `BillingTermsId:select-one`, `CustomerSourceId:select-one`, `EmailInvoice:checkbox`, `EmailInvoice:hidden`, `mycustomfield:text`, `BillingAddress:id:text`, `BillingCountry:hidden`, `BillingCity:text`, `BillingState:text`, `BillingZip:text`, `FirstContactTypeId:select-one`, `FirstContactInfo:text`, `SecondContactTypeId:select-one`, `SecondContactInfo:text`, `HomeAddressSameAsBilling:checkbox`, `HomeAddressSameAsBilling:hidden`, `myothercustomfield:text`, `HomeAddress:id:text`, `HomeCountry:hidden`, `HomeCity:text`, `HomeState:text`, `HomeZip:text`, `HomeSubdivision:text`, `HomeName:text`, `HomeLocationPhone:text`, `HomeServiceTagsSelected:checkbox`, `HomeSpecialInstructions:textarea`, `HomePetInstructions:textarea`, `HomeDirections:textarea`, `HomeSpecialEquipment:textarea`, `HomeWasteDisposal:textarea`, `HomeAcessInformation:textarea`, `HomeInternalMemo:textarea`

#### `/Customer/Create#sidebar_tab_customer`

- Rendering: server-rendered · jquery 1.11.2 · anti-forgery field
- (no XHR/fetch calls)
- Form `POST /Customer/Create`: `__RequestVerificationToken:hidden`, `CustomerQuoteDetailLineId:hidden`, `CustomerFirstName:text`, `CustomerMiddleName:text`, `CustomerLastName:text`, `CustomerTagsSelected:checkbox`, `CustomerCompanyName:text`, `BillingTermsId:select-one`, `CustomerSourceId:select-one`, `EmailInvoice:checkbox`, `EmailInvoice:hidden`, `mycustomfield:text`, `BillingAddress:id:text`, `BillingCountry:hidden`, `BillingCity:text`, `BillingState:text`, `BillingZip:text`, `FirstContactTypeId:select-one`, `FirstContactInfo:text`, `SecondContactTypeId:select-one`, `SecondContactInfo:text`, `HomeAddressSameAsBilling:checkbox`, `HomeAddressSameAsBilling:hidden`, `myothercustomfield:text`, `HomeAddress:id:text`, `HomeCountry:hidden`, `HomeCity:text`, `HomeState:text`, `HomeZip:text`, `HomeSubdivision:text`, `HomeName:text`, `HomeLocationPhone:text`, `HomeServiceTagsSelected:checkbox`, `HomeSpecialInstructions:textarea`, `HomePetInstructions:textarea`, `HomeDirections:textarea`, `HomeSpecialEquipment:textarea`, `HomeWasteDisposal:textarea`, `HomeAcessInformation:textarea`, `HomeInternalMemo:textarea`

#### `/Customer/Create#sidebar_tab_employees`

- Rendering: server-rendered · jquery 1.11.2 · anti-forgery field
- (no XHR/fetch calls)
- Form `POST /Customer/Create`: `__RequestVerificationToken:hidden`, `CustomerQuoteDetailLineId:hidden`, `CustomerFirstName:text`, `CustomerMiddleName:text`, `CustomerLastName:text`, `CustomerTagsSelected:checkbox`, `CustomerCompanyName:text`, `BillingTermsId:select-one`, `CustomerSourceId:select-one`, `EmailInvoice:checkbox`, `EmailInvoice:hidden`, `mycustomfield:text`, `BillingAddress:id:text`, `BillingCountry:hidden`, `BillingCity:text`, `BillingState:text`, `BillingZip:text`, `FirstContactTypeId:select-one`, `FirstContactInfo:text`, `SecondContactTypeId:select-one`, `SecondContactInfo:text`, `HomeAddressSameAsBilling:checkbox`, `HomeAddressSameAsBilling:hidden`, `myothercustomfield:text`, `HomeAddress:id:text`, `HomeCountry:hidden`, `HomeCity:text`, `HomeState:text`, `HomeZip:text`, `HomeSubdivision:text`, `HomeName:text`, `HomeLocationPhone:text`, `HomeServiceTagsSelected:checkbox`, `HomeSpecialInstructions:textarea`, `HomePetInstructions:textarea`, `HomeDirections:textarea`, `HomeSpecialEquipment:textarea`, `HomeWasteDisposal:textarea`, `HomeAcessInformation:textarea`, `HomeInternalMemo:textarea`

#### `/Customer/Search#tab_basic`

- Rendering: server-rendered · jquery 1.11.2 · anti-forgery field
- (no XHR/fetch calls)
- Form `POST /Customer/Search`: `__RequestVerificationToken:hidden`, `Tags:text`
- Form `POST /Customer/AdvancedSearch`: `__RequestVerificationToken:hidden`, `SearchTypeId:radio`, `CustomerSearchId:select-one`, `HomeSearchId:select-one`, `SearchValue:text`

#### `/Customer/Search#tab_advanced`

- Rendering: server-rendered · jquery 1.11.2 · anti-forgery field
- (no XHR/fetch calls)
- Form `POST /Customer/Search`: `__RequestVerificationToken:hidden`, `Tags:text`
- Form `POST /Customer/AdvancedSearch`: `__RequestVerificationToken:hidden`, `SearchTypeId:radio`, `CustomerSearchId:select-one`, `HomeSearchId:select-one`, `SearchValue:text`

#### `/Customer/Search#sidebar_tab_customer`

- Rendering: server-rendered · jquery 1.11.2 · anti-forgery field
- (no XHR/fetch calls)
- Form `POST /Customer/Search`: `__RequestVerificationToken:hidden`, `Tags:text`
- Form `POST /Customer/AdvancedSearch`: `__RequestVerificationToken:hidden`, `SearchTypeId:radio`, `CustomerSearchId:select-one`, `HomeSearchId:select-one`, `SearchValue:text`

#### `/Customer/Search#sidebar_tab_employees`

- Rendering: server-rendered · jquery 1.11.2 · anti-forgery field
- (no XHR/fetch calls)
- Form `POST /Customer/Search`: `__RequestVerificationToken:hidden`, `Tags:text`
- Form `POST /Customer/AdvancedSearch`: `__RequestVerificationToken:hidden`, `SearchTypeId:radio`, `CustomerSearchId:select-one`, `HomeSearchId:select-one`, `SearchValue:text`

#### `/Job/Schedule#mdlPrintJobs`

- Rendering: server-rendered + XHR · knockout, jquery 1.11.2, kendo · anti-forgery field · 5 table(s)
- `POST {tenant}.maidcentral.com/Event/CreateOrEditEvent (blocked: write)`
- `GET {tenant}.maidcentral.com/Job/AdjustTeamSize`
- `GET {tenant}.maidcentral.com/ProviderStatus/Current`
- Form `POST /ServiceSetInformation/PrintJobWorksheets`: `__RequestVerificationToken:hidden`, `PrintDate:hidden`, `PrintStartTeam:select-one`

#### `/Job/Schedule#sidebar_tab_customer`

- Rendering: server-rendered · jquery 1.11.2, kendo · anti-forgery field
- (no XHR/fetch calls)
- Form `POST /ServiceSetInformation/PrintJobWorksheets`: `__RequestVerificationToken:hidden`, `PrintDate:hidden`, `PrintStartTeam:select-one`

#### `/Job/Schedule#sidebar_tab_employees`

- Rendering: server-rendered · jquery 1.11.2, kendo · anti-forgery field
- (no XHR/fetch calls)
- Form `POST /ServiceSetInformation/PrintJobWorksheets`: `__RequestVerificationToken:hidden`, `PrintDate:hidden`, `PrintStartTeam:select-one`

#### `/Job/TeamMonitor#sidebar_tab_customer`

- Rendering: server-rendered + XHR · knockout, jquery 1.11.2, kendo · 5 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `GET {tenant}.maidcentral.com/Job/TeamMonitorData`
- `GET {tenant}.maidcentral.com/Job/TeamMonitorTeams`
- `GET {tenant}.maidcentral.com/ProviderStatus/Current`

#### `/Job/TeamMonitor#sidebar_tab_employees`

- Rendering: server-rendered + XHR · knockout, jquery 1.11.2, kendo · 5 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `GET {tenant}.maidcentral.com/Job/TeamMonitorData`
- `GET {tenant}.maidcentral.com/Job/TeamMonitorTeams`
- `GET {tenant}.maidcentral.com/ProviderStatus/Current`

#### `/Job/TeamMonitor?Date=:date`

- Rendering: server-rendered + XHR · knockout, jquery 1.11.2, kendo · 5 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `GET {tenant}.maidcentral.com/Job/TeamMonitorData`
- `GET {tenant}.maidcentral.com/Job/TeamMonitorTeams`
- `GET {tenant}.maidcentral.com/ProviderStatus/Current`

#### `/Job/Monthly#sidebar_tab_customer`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 2 table(s)
- `POST {tenant}.maidcentral.com/Event/CreateOrEditEvent (blocked: write)`

#### `/Job/Monthly#sidebar_tab_employees`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 2 table(s)
- `POST {tenant}.maidcentral.com/Event/CreateOrEditEvent (blocked: write)`

#### `/Estimate#tab_2`

- Rendering: server-rendered · jquery 1.11.2
- (no XHR/fetch calls)

#### `/Estimate#tab_3`

- Rendering: server-rendered · jquery 1.11.2
- (no XHR/fetch calls)

#### `/Estimate#tab_4`

- Rendering: server-rendered · jquery 1.11.2
- (no XHR/fetch calls)

#### `/Estimate#sidebar_tab_customer`

- Rendering: server-rendered · jquery 1.11.2
- (no XHR/fetch calls)

#### `/Estimate#sidebar_tab_employees`

- Rendering: server-rendered · jquery 1.11.2
- (no XHR/fetch calls)

#### `/Estimate/Search#sidebar_tab_customer`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 1 table(s)
- `GET {tenant}.maidcentral.com/estimate/GetSearch`
- `GET {tenant}.maidcentral.com/Home/Sidebar`

#### `/Estimate/Search#sidebar_tab_employees`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 1 table(s)
- `GET {tenant}.maidcentral.com/estimate/GetSearch`
- `GET {tenant}.maidcentral.com/Home/Sidebar`

#### `/Property/Create`

- Rendering: server-rendered + XHR · jquery 1.11.2 · anti-forgery field
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `GET maps.googleapis.com/maps/api/mapsjs/gen_204`
- Form `POST /Property/Create`: `__RequestVerificationToken:hidden`, `PMGName:text`, `mycustomfield:text`, `PMGMailingAddress:id:text`, `PMGMailingCountry:hidden`, `PMGMailingCity:text`, `PMGMailingRegion:text`, `PMGMailingPostalCode:text`

#### `/Property#sidebar_tab_customer`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 1 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`

#### `/Property#sidebar_tab_employees`

- Rendering: server-rendered · jquery 1.11.2 · 1 table(s)
- (no XHR/fetch calls)

#### `/Report/Inspections`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 1 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- Form `GET /Report/Inspections`: `StartDate:text`, `EndDate:text`

#### `/Webhook/Subscriptions`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 1 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `POST {tenant}.maidcentral.com/webhook/getWebhookSubscriptions`
- Form `GET (same page)`: (no fields)

#### `/Report/Consistency?EndDate=:date&StartDate=:date`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 6 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- Form `POST /Report/Consistency`: `StartDate:hidden`, `EndDate:hidden`, `ServiceSetTypeIds:select-multiple`, `TeamListIds:checkbox`, `ZoneIds:checkbox`, `ServiceTypeIds:checkbox`, `Filter:text`, `FilterType:radio`, `JobQueryCount:number`

#### `/Report/CustomerIncome`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 1 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `GET {tenant}.maidcentral.com/ProviderStatus/Current`
- Form `GET /Report/CustomerIncome`: `StartDate:text`, `EndDate:text`

#### `/Report/CustomerScorecardStats`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 1 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `GET {tenant}.maidcentral.com/ProviderStatus/Current`

#### `/Report/FirstTimeInJobs`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 1 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- Form `POST /Report/FirstTimeInJobs`: `StartDate:text`, `EndDate:text`

#### `/Report/KeyReport`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 1 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`

#### `/Report/RegisteredCustomers`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 1 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- Form `POST /`: `customers_length:select-one`

#### `/Report/ZipZoneList?EndDate=:date&StartDate=:date`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 1 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- Form `GET /Report/ZipZoneList`: `StartDate:text`, `EndDate:text`

#### `/ServiceCompanyGoal/Quarterly`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 1 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`

#### `/Report/RevenueByWeek`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 1 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`

#### `/Report/EmployeeSurveyResponses`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 1 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- Form `GET /Report/EmployeeSurveyResponses`: `StartDate:text`, `EndDate:text`

#### `/Report/EmployeeTurnoverAnnual`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 1 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- Form `POST /Report/EmployeeTurnoverAnnual`: `StartDate:text`, `EndDate:text`

#### `/Report/TimeChangeRequests?MaxDateFilterId=:date&MinDateFilterId=:date`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 1 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `POST {tenant}.maidcentral.com/report/getTimeChangeRequests`
- `POST {tenant}.maidcentral.com/Time/ViewTimeRequestModal`
- `GET {tenant}.maidcentral.com/view-resources/Views/Time/_ViewTimeRequestModal.js`
- Form `GET (same page)`: `MinDateFilterId:text`, `MaxDateFilterId:text`, `StatusSelected:radio`, `TypesSelected:checkbox`

#### `/Report/CreditCardTransactions?MaxDateTimeFilter=:date&MinDateTimeFilter=:date`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 2 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `POST {tenant}.maidcentral.com/report/getCreditCardTransactions`
- Form `GET (same page)`: `MinDateTimeFilter:hidden`, `MaxDateTimeFilter:hidden`, `TableFilterId:text`

#### `/Report/CancelledService?EndDate=:date&StartDate=:date`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 8 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- Form `POST /Report/CancelledService`: `StartDate:hidden`, `EndDate:hidden`, `ServiceSetTypeGroupIds:checkbox`, `ServiceSetTypeIds:select-multiple`, `TeamListIds:checkbox`, `ZoneIds:checkbox`, `ServiceTypeIds:checkbox`, `CustomerSourceIds:checkbox`, `Filter:text`

#### `/Report/HomeStats`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 4 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`

#### `/Report/DailyJobs`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 1 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- Form `POST /Report/DailyJobs`: `JobDate:text`, `JobStatusSelectListSelected:checkbox`

#### `/Report/JobCountStatusByDate`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 2 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- `GET {tenant}.maidcentral.com/ProviderStatus/Current`
- Form `POST /Report/JobCountStatusByDate`: `StartDate:text`, `EndDate:text`, `ServiceTypeSelected:checkbox`, `ServiceSetTypeSelected:checkbox`

#### `/Report/RateAdjustmentUsage?EndDate=:date&StartDate=:date`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 4 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- Form `GET /Report/RateAdjustmentUsage`: `StartDate:text`, `EndDate:text`

#### `/Report/Rates`

- Rendering: server-rendered + XHR · jquery 1.11.2
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- Form `POST /Report/Rates`: `RateChangeType:hidden`, `VarianceThreshold:text`, `HourlyRate:text`, `RateChangeAllowedHoursType:select-one`, `RateIncreaseAmount:text`, `JobFilterStartDate:text`, `MonthsSinceRateChange:text`, `RateEffectiveDate:text`, `NormalizeNewAllowedHours:checkbox`, `NormalizeNewAllowedHours:hidden`, `UpdatePercentRecurringRateMods:checkbox`, `UpdatePercentRecurringRateMods:hidden`, `IncludeFirstTimeInJobs:checkbox`, `IncludeFirstTimeInJobs:hidden`, `IncludeRedoJobs:checkbox`, `IncludeRedoJobs:hidden`, `IncludeTraineeJobs:checkbox`, `IncludeTraineeJobs:hidden`, `IncludeTimeRateModJobs:checkbox`, `IncludeTimeRateModJobs:hidden`, `ServiceSetTypesSelected:checkbox`, `ServiceTypesSelected:checkbox`, `ZoneSelectListSelected:checkbox`, `ScorecardResponseListSelected:checkbox`
- Form `POST /EmailTemplate/SendRateAdjustmentOrIncreaseEmail`: `RateIncreaseSubject:hidden`, `RateIncreaseBodyHtml:hidden`, `RateAdjustmentSubject:hidden`, `RateAdjustmentBodyHtml:hidden`, `Subject:text`, `BodyHtml:textarea`

#### `/Report/HomeStatsDiff`

- Rendering: server-rendered + XHR · jquery 1.11.2
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- Form `POST /Report/HomeStatsDiff`: `StartDate:text`, `EndDate:text`, `ServiceSetTypeSelectListSelected:checkbox`, `ServiceFrequencySelectListSelected:checkbox`

#### `/Report/HomeStatsDetail`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 2 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- Form `POST /Report/HomeStatsDetail`: `ServiceSetTypeSelectListSelected:checkbox`, `ServiceFrequencySelectListSelected:checkbox`

#### `/Report/GrossProfitByServiceSet`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 1 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- Form `POST /Report/GrossProfitByServiceSet`: `Start:text`, `End:text`, `IncludeTrainee:checkbox`, `IncludeTrainee:hidden`, `IncludeFirstTimeIn:checkbox`, `IncludeFirstTimeIn:hidden`

#### `/Report/HomeStatsTracker`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 1 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- Form `POST /Report/HomeStatsTracker`: `StartDate:text`, `EndDate:text`, `ServiceSetTypeSelectListSelected:checkbox`, `ServiceFrequencySelectListSelected:checkbox`

#### `/Report#sidebar_tab_customer`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 1 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`

#### `/Report#sidebar_tab_employees`

- Rendering: server-rendered · jquery 1.11.2 · 1 table(s)
- (no XHR/fetch calls)

#### `/Report/Kiosk#revenue_report_1`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 4 table(s)
- `GET {tenant}.maidcentral.com/Report/ActivityPipeline`
- `GET {tenant}.maidcentral.com/Report/GetSalesActivtyServiceCompany`
- `GET {tenant}.maidcentral.com/Report/GetSalesServiceCompany`
- `GET {tenant}.maidcentral.com/Report/RevenueFuture`
- `GET {tenant}.maidcentral.com/Report/SalesPipeline`
- Form `POST /Report/ActivityPipeline`: `StartDate:text`, `EndDate:text`, `HideUsers:checkbox`, `HideUsers:hidden`

#### `/Report/Kiosk#revenue_report_2`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 4 table(s)
- `GET {tenant}.maidcentral.com/Report/ActivityPipeline`
- `GET {tenant}.maidcentral.com/Report/GetSalesActivtyServiceCompany`
- `GET {tenant}.maidcentral.com/Report/GetSalesServiceCompany`
- `GET {tenant}.maidcentral.com/Report/RevenuePast`
- `GET {tenant}.maidcentral.com/Report/SalesPipeline`
- Form `POST /Report/ActivityPipeline`: `StartDate:text`, `EndDate:text`, `HideUsers:checkbox`, `HideUsers:hidden`

#### `/Report/Kiosk#revenue_report_3`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 4 table(s)
- `GET {tenant}.maidcentral.com/Report/ActivityPipeline`
- `GET {tenant}.maidcentral.com/Report/GetSalesActivtyServiceCompany`
- `GET {tenant}.maidcentral.com/Report/GetSalesServiceCompany`
- `GET {tenant}.maidcentral.com/Report/RevenueFuture`
- `GET {tenant}.maidcentral.com/Report/RevenuePast`
- `GET {tenant}.maidcentral.com/Report/SalesPipeline`
- Form `POST /Report/ActivityPipeline`: `StartDate:text`, `EndDate:text`, `HideUsers:checkbox`, `HideUsers:hidden`

#### `/Report/Kiosk#revenue_report_4`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 4 table(s)
- `GET {tenant}.maidcentral.com/Report/ActivityPipeline`
- `GET {tenant}.maidcentral.com/Report/GetSalesActivtyServiceCompany`
- `GET {tenant}.maidcentral.com/Report/GetSalesServiceCompany`
- `GET {tenant}.maidcentral.com/Report/RevenueFuture`
- `GET {tenant}.maidcentral.com/Report/RevenuePast`
- `GET {tenant}.maidcentral.com/Report/SalesPipeline`
- Form `POST /Report/ActivityPipeline`: `StartDate:text`, `EndDate:text`, `HideUsers:checkbox`, `HideUsers:hidden`

#### `/Report/Kiosk#revenue_report_5`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 4 table(s)
- `GET {tenant}.maidcentral.com/Report/ActivityPipeline`
- `GET {tenant}.maidcentral.com/Report/GetSalesActivtyServiceCompany`
- `GET {tenant}.maidcentral.com/Report/GetSalesServiceCompany`
- `GET {tenant}.maidcentral.com/Report/RevenueFuture`
- `GET {tenant}.maidcentral.com/Report/RevenuePast`
- `GET {tenant}.maidcentral.com/Report/SalesPipeline`
- Form `POST /Report/ActivityPipeline`: `StartDate:text`, `EndDate:text`, `HideUsers:checkbox`, `HideUsers:hidden`

#### `/Report/Kiosk#sidebar_tab_customer`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 4 table(s)
- `GET {tenant}.maidcentral.com/Report/ActivityPipeline`
- `GET {tenant}.maidcentral.com/Report/GetSalesActivtyServiceCompany`
- `GET {tenant}.maidcentral.com/Report/GetSalesServiceCompany`
- `GET {tenant}.maidcentral.com/Report/RevenueFuture`
- `GET {tenant}.maidcentral.com/Report/RevenuePast`
- `GET {tenant}.maidcentral.com/Report/SalesPipeline`
- Form `POST /Report/ActivityPipeline`: `StartDate:text`, `EndDate:text`, `HideUsers:checkbox`, `HideUsers:hidden`

#### `/Report/Kiosk#sidebar_tab_employees`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 4 table(s)
- `GET {tenant}.maidcentral.com/Report/ActivityPipeline`
- `GET {tenant}.maidcentral.com/Report/GetSalesActivtyServiceCompany`
- `GET {tenant}.maidcentral.com/Report/GetSalesServiceCompany`
- `GET {tenant}.maidcentral.com/Report/RevenueFuture`
- `GET {tenant}.maidcentral.com/Report/RevenuePast`
- `GET {tenant}.maidcentral.com/Report/SalesPipeline`
- Form `POST /Report/ActivityPipeline`: `StartDate:text`, `EndDate:text`, `HideUsers:checkbox`, `HideUsers:hidden`

#### `/Report/SalesKpi?EndDate=:date&StartDate=:date#sidebar_tab_customer`

- Rendering: server-rendered · jquery 1.11.2 · 3 table(s)
- (no XHR/fetch calls)
- Form `GET (same page)`: `StartDate:hidden`, `EndDate:hidden`

#### `/Report/SalesKpi?EndDate=:date&StartDate=:date#sidebar_tab_employees`

- Rendering: server-rendered · jquery 1.11.2 · 3 table(s)
- (no XHR/fetch calls)
- Form `GET (same page)`: `StartDate:hidden`, `EndDate:hidden`

#### `/Report/SalesKpi2#sidebar_tab_customer`

- Rendering: server-rendered · jquery 1.11.2
- (no XHR/fetch calls)

#### `/Report/SalesKpi2#sidebar_tab_employees`

- Rendering: server-rendered · jquery 1.11.2
- (no XHR/fetch calls)

#### `/ServiceCompanyGoal/Create`

- Rendering: server-rendered + XHR · jquery 1.11.2 · anti-forgery field
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- Form `POST /ServiceCompanyGoal/Create`: `__RequestVerificationToken:hidden`, `YearQuarter:select-one`, `ServiceCompanyId:select-one`, `Revenue:number`, `PayrollToRevenue:number`, `EffeciencyFactor:number`, `Scorecard:number`, `NetClients:number`, `RevPerHour:number`, `RevPerJob:number`, `CustomerAttritionRate:number`

#### `/Report/SpotlightDashboard#sidebar_tab_customer`

- Rendering: server-rendered + XHR · jquery 1.11.2
- `GET {tenant}.maidcentral.com/Home/Sidebar`

#### `/Report/SpotlightDashboard#sidebar_tab_employees`

- Rendering: server-rendered · jquery 1.11.2
- (no XHR/fetch calls)

#### `/Compliance#sidebar_tab_customer`

- Rendering: server-rendered · jquery 1.11.2 · 1 table(s)
- (no XHR/fetch calls)
- Form `POST /Compliance/CreateOrUpdateBreak`: `ServiceCompanyBreakId:hidden`, `Name:text`, `Length:number`, `BreakTypeId:select-one`, `Description:text`, `IsActive:select-one`

#### `/Compliance#sidebar_tab_employees`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 1 table(s)
- `GET {tenant}.maidcentral.com/Compliance/CreateOrUpdateBreak/`
- Form `POST /Compliance/CreateOrUpdateBreak`: `ServiceCompanyBreakId:hidden`, `Name:text`, `Length:number`, `BreakTypeId:select-one`, `Description:text`, `IsActive:select-one`

#### `/Report/RevenueProductionPlanning#sidebar_tab_customer`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 1 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- Form `POST /Report/RevenueProductionPlanning`: `StartDate:text`, `EndDate:text`, `GroupById:select-one`, `ColumnOptionListSelected:checkbox`

#### `/Report/RevenueProductionPlanning#sidebar_tab_employees`

- Rendering: server-rendered · jquery 1.11.2 · 1 table(s)
- (no XHR/fetch calls)
- Form `POST /Report/RevenueProductionPlanning`: `StartDate:text`, `EndDate:text`, `GroupById:select-one`, `ColumnOptionListSelected:checkbox`

#### `/Report/AvailabilityCalendarGroup#sidebar_tab_customer`

- Rendering: server-rendered · jquery 1.11.2 · 2 table(s)
- (no XHR/fetch calls)

#### `/Report/AvailabilityCalendarGroup#sidebar_tab_employees`

- Rendering: server-rendered · jquery 1.11.2 · 2 table(s)
- (no XHR/fetch calls)

#### `/HomeInformation/Details/:id?cid=:id&hid=:id&hsid=:id#tab_service`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 6 table(s)
- `POST {tenant}.maidcentral.com/HomeServiceInformation/Jobs`
- `GET {tenant}.maidcentral.com/rates/GetRatesByServiceSetInformationId`

#### `/Portal/Feedback?j=*` — How'd We Do?

- Rendering: server-rendered + XHR · jquery 3.6.0
- `GET {tenant}.maidcentral.com/Portal/Layout/Footer/:id`
- Form `GET (same page)`: `CustomerInformationId:hidden`, `JobInformationId:hidden`, `token:hidden`, `rating:radio`, `AdditionalComments:textarea`, `TipBasedOnAmount:hidden`, `JobTip:text`

#### `/Report/DispatchBoard?EndDate=:date&StartDate=:date#sidebar_tab_customer`

- Rendering: server-rendered + XHR · jquery 1.11.2 · 2 table(s)
- `GET {tenant}.maidcentral.com/Home/Sidebar`
- Form `POST /Report/DispatchBoard`: `StartDate:text`, `EndDate:text`, `JobStatusSelected:checkbox`, `ServiceSetTypeId:select-one`, `BillingTermsId:select-one`, `JobTagsSelected:checkbox`, `ServiceSetTagsSelected:checkbox`, `HomeTagsSelected:checkbox`, `CustomerTagsSelected:checkbox`, `dispatchBoardTable_length:select-one`

#### `/Report/DispatchBoard?EndDate=:date&StartDate=:date#sidebar_tab_employees`

- Rendering: server-rendered · jquery 1.11.2 · 2 table(s)
- (no XHR/fetch calls)
- Form `POST /Report/DispatchBoard`: `StartDate:text`, `EndDate:text`, `JobStatusSelected:checkbox`, `ServiceSetTypeId:select-one`, `BillingTermsId:select-one`, `JobTagsSelected:checkbox`, `ServiceSetTagsSelected:checkbox`, `HomeTagsSelected:checkbox`, `CustomerTagsSelected:checkbox`, `dispatchBoardTable_length:select-one`

### Endpoints

#### `GET {tenant}.maidcentral.com/` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 4×
- Pages: `/`

#### `GET {tenant}.maidcentral.com/Campaign` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 3×
- Pages: `/Campaign`

#### `GET {tenant}.maidcentral.com/Campaign/CreateAccountCustomerInvite` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: clients
- Pages: `/Campaign/CreateAccountCustomerInvite`

#### `GET {tenant}.maidcentral.com/Campaign/Employee` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: employees
- Pages: `/Campaign/Employee`

#### `GET {tenant}.maidcentral.com/Campaign/GetManualCampaignHistory` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 3×
- Pages: `/Campaign`
- Query: `_` (:id)

#### `GET {tenant}.maidcentral.com/Campaign/QuoteCampaign` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 2×
- Capabilities: leads-quotes
- Pages: `/Campaign/QuoteCampaign`

#### `GET {tenant}.maidcentral.com/ChangeLog` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Pages: `/ChangeLog`

#### `GET {tenant}.maidcentral.com/Communication` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 2×
- Capabilities: notes-messages
- Pages: `/Communication`, `/Communication?id=:id&info=*&typeId=:id`
- Query: `id` (:id); `typeId` (:id); `info` (<string>)

#### `POST {tenant}.maidcentral.com/Communication/GetMessageThread` [xhr] (read via POST)

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
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

- Status: 200 · Auth: cookie · Returns: html · Seen 2×
- Capabilities: notes-messages, settings
- Pages: `/Company/BroadcastMessage`

#### `POST {tenant}.maidcentral.com/Company/BroadcastMessage` [xhr] (blocked during capture: write)

- Status: n/a · Auth: cookie · Returns: n/a · Seen 2×
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

#### `GET {tenant}.maidcentral.com/Company/GetUsers/` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: settings
- Pages: `/Company/Settings#tb-integrations`
- Query: `_` (:id)

#### `POST {tenant}.maidcentral.com/Company/ScheduleExceptionCalendar` [xhr] (read via POST)

- Status: 200 · Auth: cookie · Returns: json · Seen 6×
- Capabilities: scheduling, settings
- Pages: `/Company/ScheduleExceptions`, `/Company/ScheduleExceptions#sidebar_tab_customer`

<details><summary>Request body</summary>

```json
{
  "start": "string",
  "end": "string"
}
```
</details>

<details><summary>Response shape</summary>

```json
[
  {
    "url": "null",
    "late": "boolean",
    "outOfRotation": "boolean",
    "description": "null",
    "id": "string",
    "title": "string",
    "date": "null",
    "start": "string",
    "end": "string",
    "color": "string",
    "textColor": "string",
    "allDay": "boolean",
    "editable": "boolean"
  }
]
```
</details>

#### `GET {tenant}.maidcentral.com/Company/ScheduleExceptions` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 6×
- Capabilities: scheduling, settings
- Pages: `/Company/ScheduleExceptions`

#### `GET {tenant}.maidcentral.com/Company/Settings` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 7×
- Capabilities: settings
- Pages: `/Company/Settings`

#### `GET {tenant}.maidcentral.com/Compliance` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 2×
- Pages: `/Compliance`

#### `GET {tenant}.maidcentral.com/Compliance/CreateOrUpdateBreak/` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 3×
- Pages: `/Compliance`, `/Compliance#sidebar_tab_employees`
- Query: `_` (:id)
- Returns form `POST /Compliance/CreateOrUpdateBreak`: `ServiceCompanyBreakId:hidden`, `Name:text`, `Length:number`, `BreakTypeId:select-one`, `Description:text`, `IsActive:select-one`

#### `POST {tenant}.maidcentral.com/CspReport/Report` [xhr] (blocked during capture: write)

- Status: n/a · Auth: cookie · Returns: n/a · Seen 4×
- Capabilities: reports
- Pages: `/Report/CustomerEfficiencyMap`, `/Report/ScheduleEfficiencyMap?EndDate=:date&StartDate=:date`

<details><summary>Request body</summary>

```json
{
  "csp-report": {
    "document-uri": "string",
    "referrer": "string",
    "violated-directive": "string",
    "effective-directive": "string",
    "original-policy": "string",
    "disposition": "string",
    "blocked-uri": "string",
    "line-number": "number",
    "column-number": "number",
    "source-file": "string",
    "status-code": "number",
    "script-sample": "string"
  }
}
```
</details>

#### `GET {tenant}.maidcentral.com/Customer` [page]

- Status: 301 · Auth: cookie · Returns: redirect · Seen 1×
- Capabilities: clients
- Pages: `/Customer`

#### `GET {tenant}.maidcentral.com/Customer/Attachments/:id` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 2×
- Capabilities: clients
- Pages: `/Customer/Details/:id?cid=:id#tab_attachment`
- Query: `_` (:id)

#### `GET {tenant}.maidcentral.com/Customer/Create` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 2×
- Capabilities: clients
- Pages: `/Customer/Create`

#### `GET {tenant}.maidcentral.com/Customer/CreateAccount` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: clients
- Pages: `/Customer/Details/:id?cid=:id#tab_account`
- Query: `cid` (:id); `_` (:id)
- Returns form `POST /Customer/CreateAccount`: `CustomerInformationId:hidden`, `Email:text`

#### `GET {tenant}.maidcentral.com/Customer/CustomerNotes/:id` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 2×
- Capabilities: clients, notes-messages
- Pages: `/Customer/Details/:id?cid=:id#tab_notes`
- Query: `_` (:id)

#### `GET {tenant}.maidcentral.com/Customer/CustomerPreferences` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 2×
- Capabilities: clients
- Pages: `/Customer/Details/:id?cid=:id#tab_preferences`
- Query: `id` (:id); `_` (:id)

#### `GET {tenant}.maidcentral.com/Customer/CustomerServiceRequests` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: clients
- Pages: `/Customer/CustomerServiceRequests`

#### `GET {tenant}.maidcentral.com/Customer/Details/:id` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 26×
- Capabilities: clients
- Pages: `/Customer/Details/:id?cid=:id`
- Query: `cid` (:id)

#### `GET {tenant}.maidcentral.com/Customer/EditTicket/` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 6×
- Capabilities: clients
- Pages: `/`, `/#sidebar_tab_customer`, `/Estimate/Details/:id`, `/Home`
- Query: `id` (:id); `typeId` (:id); `_` (:id)
- Returns form `POST /Customer/EditTicket`: `__RequestVerificationToken:hidden`, `Id:hidden`, `TicketTypeId:hidden`, `OpenDate:text`, `CloseNotes:textarea`, `btnCloseTicket:submit`

#### `GET {tenant}.maidcentral.com/Customer/GetAssignPmgForm` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 2×
- Capabilities: clients
- Pages: `/Customer/Details/:id?cid=:id#tab_account`
- Query: `id` (:id); `_` (:id)
- Returns form `POST /Customer/AssignPmg`: `__RequestVerificationToken:hidden`, `CustomerInformationId:hidden`, `PMGId:select-one`

#### `GET {tenant}.maidcentral.com/Customer/GetCustomerAgreements/:id` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 2×
- Capabilities: clients
- Pages: `/Customer/Details/:id?cid=:id#tab_agreements`
- Query: `_` (:id)

#### `GET {tenant}.maidcentral.com/Customer/GetCustomerContacts/:id` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 2×
- Capabilities: clients
- Pages: `/Customer/Details/:id?cid=:id#tab_contacts`
- Query: `_` (:id)

#### `GET {tenant}.maidcentral.com/Customer/GetCustomerPmgs` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 2×
- Capabilities: clients
- Pages: `/Customer/Details/:id?cid=:id#tab_account`
- Query: `id` (:id); `_` (:id)

#### `POST {tenant}.maidcentral.com/Customer/Jobs` [xhr] (read via POST)

- Status: 200 · Auth: cookie · Returns: json · Seen 26×
- Capabilities: clients, jobs
- Pages: `/Customer/Details/:id?cid=:id`

<details><summary>Request body</summary>

```json
{
  "id": "string",
  "start": "string",
  "end": "string"
}
```
</details>

<details><summary>Response shape</summary>

```json
[
  {
    "url": "null",
    "late": "boolean",
    "outOfRotation": "boolean",
    "description": "null",
    "id": "string",
    "title": "string",
    "date": "string",
    "start": "string",
    "end": "string",
    "color": "string",
    "textColor": "null",
    "allDay": "boolean",
    "editable": "boolean"
  }
]
```
</details>

#### `GET {tenant}.maidcentral.com/Customer/ScorecardPartial` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 2×
- Capabilities: clients, billing
- Pages: `/Customer/Details/:id?cid=:id#tab_scorecard_customer`
- Query: `id` (:id); `_` (:id)

#### `GET {tenant}.maidcentral.com/Customer/Search` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 7×
- Capabilities: clients
- Pages: `/Customer/Search`

#### `GET {tenant}.maidcentral.com/Customer/Stats/:id` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 26×
- Capabilities: clients, reports
- Pages: `/Customer/Details/:id?cid=:id`
- Query: `_` (:id)

#### `GET {tenant}.maidcentral.com/CustomerBilling/CustomerBillings/:id` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 2×
- Capabilities: clients, billing
- Pages: `/Customer/Details/:id?cid=:id#tab_billing`
- Query: `_` (:id)

#### `GET {tenant}.maidcentral.com/CustomerSource` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: clients
- Pages: `/CustomerSource`

#### `GET {tenant}.maidcentral.com/Dashboard/Index/:id` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 4×
- Capabilities: reports
- Pages: `/Dashboard/Index/:id`

#### `GET {tenant}.maidcentral.com/EmailTemplate` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: notes-messages, settings
- Pages: `/EmailTemplate`

#### `GET {tenant}.maidcentral.com/Employee` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 2×
- Capabilities: employees
- Pages: `/Employee`

#### `GET {tenant}.maidcentral.com/Employee/CalendarDayAvailability` [xhr]

- Status: 200 · Auth: cookie · Returns: json · Seen 13×
- Capabilities: scheduling, employees
- Pages: `/Company/ScheduleExceptions`, `/Company/ScheduleExceptions#sidebar_tab_customer`, `/Employee/Details/:id#tab_emp_attendance`, `/Employee/Profile`
- Query: `start` (<string>); `end` (<string>); `_` (:id)

<details><summary>Response shape</summary>

```json
[]
```
</details>

#### `GET {tenant}.maidcentral.com/Employee/ContactTicketsPartial` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: clients, employees
- Pages: `/Employee/Details/:id#tab_contact_tickets`
- Query: `id` (:id); `_` (:id)

#### `GET {tenant}.maidcentral.com/Employee/Create` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 2×
- Capabilities: employees
- Pages: `/Employee/Create`

#### `GET {tenant}.maidcentral.com/Employee/CreateOrUpdateScheduleRequest` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: scheduling, employees
- Pages: `/Employee/Profile`
- Query: `employeeInformationId` (:id); `_` (:id)
- Returns form `POST /Employee/CreateOrUpdateEmployeeScheduleRequest`: `__RequestVerificationToken:hidden`, `EmployeeInformationId:hidden`, `PtoHoursAvailable:hidden`, `SickHoursAvailable:hidden`, `PtoHoursPending:hidden`, `SickHoursPending:hidden`, `MinRequestIncrement:hidden`, `HoursInDay:hidden`, `HiddenValidator:hidden`, `StartDate:text`, `EndDate:text`, `StartTime:text`, `EndTime:text`, `FullDay:hidden`, `RequestTypeId:select-one`, `RequestComments:textarea`

#### `GET {tenant}.maidcentral.com/Employee/Dashboard` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 2×
- Capabilities: employees, reports
- Pages: `/Employee/Dashboard`

#### `POST {tenant}.maidcentral.com/Employee/DefaultSchedule` [xhr] (read via POST)

- Status: 200 · Auth: cookie · Returns: json · Seen 2×
- Capabilities: scheduling, employees
- Pages: `/Employee/Details/:id#tab_emp_schedule`

<details><summary>Request body</summary>

```json
{
  "id": "string",
  "start": "string",
  "end": "string"
}
```
</details>

<details><summary>Response shape</summary>

```json
[
  {
    "url": "null",
    "late": "boolean",
    "outOfRotation": "boolean",
    "description": "null",
    "id": "string",
    "title": "string",
    "date": "null",
    "start": "string",
    "end": "string",
    "color": "string",
    "textColor": "null",
    "allDay": "boolean",
    "editable": "boolean"
  }
]
```
</details>

#### `GET {tenant}.maidcentral.com/Employee/DenyEmployeeScheduleRequest/:id` [page]

- Status: 302 · Auth: cookie · Returns: redirect · Seen 2×
- Capabilities: scheduling, employees
- Pages: `/Employee/DenyEmployeeScheduleRequest/:id`

#### `GET {tenant}.maidcentral.com/Employee/Details/:id` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 26×
- Capabilities: employees
- Pages: `/Employee/Details/:id`

#### `GET {tenant}.maidcentral.com/Employee/EmployeeMonitorData` [xhr]

- Status: 200 · Auth: cookie · Returns: json · Seen 3×
- Capabilities: employees
- Pages: `/Employee/Time#events-tab`, `/Employee/Time#monitor-tab`
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

- Status: 200 · Auth: cookie · Returns: json · Seen 2×
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

#### `GET {tenant}.maidcentral.com/Employee/EmployeeScheduleRequests` [xhr]

- Status: 200 · Auth: cookie · Returns: empty, html · Seen 31×
- Capabilities: scheduling, employees
- Pages: `/Employee/Details/:id`, `/Employee/Profile`
- Query: `id` (:id); `_` (:id)

#### `GET {tenant}.maidcentral.com/Employee/EmployeeScheduleRequestsModal` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: scheduling, employees
- Pages: `/Employee/Profile`
- Query: `id` (:id); `_` (:id)

#### `POST {tenant}.maidcentral.com/Employee/GetAttendance` [xhr] (read via POST)

- Status: 200 · Auth: cookie · Returns: json · Seen 7×
- Capabilities: employees
- Pages: `/Employee/Details/:id#tab_emp_attendance`, `/Employee/Profile`

<details><summary>Request body</summary>

```json
{
  "id": "string",
  "start": "string",
  "end": "string"
}
```
</details>

<details><summary>Response shape</summary>

```json
[
  {
    "url": "null",
    "late": "boolean",
    "outOfRotation": "boolean",
    "description": "null",
    "id": "string",
    "title": "string",
    "date": "string",
    "start": "string",
    "end": "string",
    "color": "string",
    "textColor": "string",
    "allDay": "boolean",
    "editable": "boolean"
  }
]
```
</details>

#### `GET {tenant}.maidcentral.com/Employee/GetEmployeeBreaks` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 10×
- Capabilities: employees
- Pages: `/Employee/Time#breaks-tab`
- Query: `_` (:id)

#### `GET {tenant}.maidcentral.com/Employee/GetEmployeeHistory/:id` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 26×
- Capabilities: employees
- Pages: `/Employee/Details/:id`
- Query: `_` (:id)

#### `GET {tenant}.maidcentral.com/Employee/Inspections` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 2×
- Capabilities: employees
- Pages: `/Employee/Details/:id#tab_inspections`
- Query: `id` (:id); `_` (:id)

#### `GET {tenant}.maidcentral.com/employee/notes` [xhr]

- Status: 200 · Auth: cookie · Returns: json · Seen 2×
- Capabilities: employees, notes-messages
- Pages: `/Employee/Details/:id#tab_note_employee`
- Query: `employeeId` (:id); `sorting` (<string>); `skipCount` (:id); `filter` (); `maxResultCount` (:id); `_` (:id)

<details><summary>Response shape</summary>

```json
{
  "TotalCount": "number",
  "Items": [
    {
      "EmployeeInformationNoteId": "number",
      "EmployeeInformationId": "number",
      "NoteTypeId": "number",
      "SentFrom": "null",
      "SentTo": "string",
      "Note": "string",
      "OpenDate": "string",
      "CloseDate": "string",
      "CloseNote": "null",
      "MsgNote": "null|string",
      "MsgId": "null|string",
      "MsgStatus": "null|string",
      "DateCreated": "string",
      "DateLastModified": "string",
      "CreatedByName": "string",
      "ClosedByName": "string",
      "TimeZoneInfoId": "string",
      "ShowCloseNotes": "boolean"
    }
  ]
}
```
</details>

#### `GET {tenant}.maidcentral.com/Employee/Profile` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 5×
- Capabilities: employees
- Pages: `/Employee/Profile`

#### `POST {tenant}.maidcentral.com/Employee/PtoHistoryModal` [xhr] (blocked during capture: write)

- Status: n/a · Auth: cookie · Returns: n/a · Seen 1×
- Capabilities: employees
- Pages: `/Employee/Profile`

<details><summary>Request body</summary>

```json
{
  "id": "string"
}
```
</details>

#### `GET {tenant}.maidcentral.com/Employee/ScheduleRequests` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 6×
- Capabilities: scheduling, employees
- Pages: `/Company/ScheduleExceptions`, `/Company/ScheduleExceptions#sidebar_tab_customer`
- Query: `_` (:id)
- Returns form `POST /Employee/ScheduleRequests`: `StartDate:text`, `EndDate:text`

#### `GET {tenant}.maidcentral.com/Employee/ScorecardPartial` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 2×
- Capabilities: employees, billing
- Pages: `/Employee/Details/:id#tab_scorecard_employee`, `/Employee/Profile#tab_scorecards`
- Query: `id` (:id); `showExcludeColumn` (false); `_` (:id)

#### `GET {tenant}.maidcentral.com/Employee/SkillsTag` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: employees, settings
- Pages: `/Employee/Details/:id#tab_skills`
- Query: `id` (:id); `_` (:id)
- Returns form `POST /Employee/SkillsTag`: `__RequestVerificationToken:hidden`, `EmployeeInformationId:hidden`, `SkillsSelected:checkbox`, `HourlyTag:checkbox`, `HourlyTag:hidden`, `ScheduledTag:checkbox`, `ScheduledTag:hidden`, `TagsSelected:checkbox`

#### `POST {tenant}.maidcentral.com/Employee/Stats` [xhr] (read via POST)

- Status: 200 · Auth: cookie · Returns: html · Seen 31×
- Capabilities: employees, reports
- Pages: `/Employee/Details/:id`, `/Employee/Profile`

<details><summary>Request body</summary>

```json
{
  "id": "string"
}
```
</details>

#### `GET {tenant}.maidcentral.com/Employee/Time` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 3×
- Capabilities: employees
- Pages: `/Employee/Time`

#### `GET {tenant}.maidcentral.com/Employee/Worksheets` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 2×
- Capabilities: employees
- Pages: `/Employee/Dashboard`
- Query: `Date` (<string>); `_` (:id)

#### `GET {tenant}.maidcentral.com/EmployeeContact/EmployeeContacts` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 2×
- Capabilities: clients, employees
- Pages: `/Employee/Details/:id#tab_contacts`
- Query: `id` (:id); `_` (:id)

#### `GET {tenant}.maidcentral.com/Error/NotFound` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 7×
- Pages: `/Error/NotFound?aspxerrorpath=*`
- Query: `aspxerrorpath` (<string>)

#### `GET {tenant}.maidcentral.com/Estimate` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 2×
- Capabilities: leads-quotes
- Pages: `/Estimate`

#### `POST {tenant}.maidcentral.com/Estimate/CampaignHistory` [xhr] (read via POST)

- Status: 200 · Auth: cookie · Returns: html · Seen 64×
- Capabilities: leads-quotes
- Pages: `/Estimate/Details/:id`

<details><summary>Request body</summary>

```json
{
  "id": "number"
}
```
</details>

#### `GET {tenant}.maidcentral.com/Estimate/Details/:id` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 108×
- Capabilities: leads-quotes
- Pages: `/Estimate/Details/:id`, `/Estimate/SalesPipeline?=:date`, `/Estimate/SalesPipeline?=:date#sidebar_tab_customer`, `/Estimate/SalesPipeline?=:date#sidebar_tab_employees`

#### `GET {tenant}.maidcentral.com/Estimate/GetOnlineLeads` [xhr]

- Status: 200 · Auth: cookie · Returns: json · Seen 2×
- Capabilities: leads-quotes
- Pages: `/Estimate/SalesPipeline?=:date`
- Query: `serviceCompanyId` (:id); `_` (:id)

<details><summary>Response shape</summary>

```json
[]
```
</details>

#### `POST {tenant}.maidcentral.com/Estimate/GetPipelineData` [xhr] (read via POST)

- Status: 200 · Auth: cookie · Returns: json · Seen 2×
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

<details><summary>Response shape</summary>

```json
{
  "Columns": [
    {
      "StatusId": "number",
      "StatusName": "string",
      "Leads": [
        {
          "CustomerQuoteId": "number",
          "CustomerName": "string",
          "Phone": "string",
          "Email": "string",
          "Address": "null|string",
          "City": "null|string",
          "PostalCode": "null|string",
          "QuoteStatusId": "number",
          "AssignedUserId": "null",
          "AssignedUserName": "null",
          "AssignedDate": "null",
          "JobRate": "null",
          "WeeklyRevenue": "number",
          "ServiceType": "null",
          "Frequency": "null",
          "Tags": [],
          "DateCreated": "string",
          "QuoteCreatedDate": "null|string",
          "LastContactDate": "string",
          "OpenTicketNote": "null|string",
          "OpenTicketDate": "null|string",
          "OpenTicketId": "null|number",
          "DaysOld": "number",
          "ServiceSetTypeId": "null",
          "ServiceSetTypeFrequencyId": "null",
          "ServiceSetTypeIds": "null|string",
          "ServiceSetTypeNames": [
            "string"
          ],
          "ServiceSetTypeGroupId": "null|number",
          "ServiceSetTypeGroupName": "null",
          "Bedrooms": "null|number",
          "FullBaths": "null|number",
          "HalfBaths": "null|number",
          "SquareFootage": "null|string",
          "HomeZoneId": "null|number",
          "ZoneName": "null|string",
          "ZoneColor": "null|string",
          "DateCreatedLocal": "string",
          "LastContactDateLocal": "string",
          "OpenTicketDateLocal": "null|string",
          "DateCreatedTimeAgo": "string",
          "LastContactDateTimeAgo": "string",
          "OpenTicketDateTimeAgo": "null|string",
          "IsCurrentlyOnline": "boolean",
          "LastOnlineActivity": "null",
          "OnlineSessionStarted": "null",
          "OnlineActivityTimeAgo": "null",
          "OnlineMinutes": "null",
          "QuotedGuid": "null|string"
        }
      ],
      "TotalValue": "number",
      "WeeklyRevenue": "null|number",
      "Count": "number"
    }
  ],
  "RepColumns": [],
  "Stats": {
    "TotalActive": "number",
    "Unassigned": "number",
    "TodayValue": "number",
    "ConversionRate": "number",
    "OpenTickets": "number"
  },
  "ViewType": "string"
}
```
</details>

#### `GET {tenant}.maidcentral.com/estimate/GetSearch` [xhr]

- Status: 200 · Auth: cookie · Returns: json · Seen 50×
- Capabilities: leads-quotes
- Pages: `/Estimate/Search`, `/Estimate/Search#sidebar_tab_customer`, `/Estimate/Search#sidebar_tab_employees`
- Query: `tableFilter` (); `firstNameFilter` (); `lastNameFilter` (); `address1Filter` (); `postalCodeFilter` (); `minDateLastModifiedTimeFilter` (); `maxDateLastModifiedTimeFilter` (); `minDateCreatedTimeFilter` (); `maxDateCreatedTimeFilter` (); `minDateQuotedTimeFilter` (); `maxDateQuotedTimeFilter` (); `minDateBookedTimeFilter` (); `maxDateBookedTimeFilter` (); `customerSourceId` (); `createdByFilter` (); `quotedByFilter` (); `bookedByFilter` (); `assignedToFilter` (); `tagsSelected` (); `quoteStatusSelected[0]` (:id); `quoteStatusSelected[1]` (:id); `quoteStatusSelected[2]` (:id); `quoteStatusSelected[3]` (:id); `quoteStatusSelected[4]` (:id); `hasAgreedFilter` (<string>); `sorting` (<string>); `skipCount` (:id); `maxResultCount` (:id); `_` (:id)

<details><summary>Response shape</summary>

```json
{
  "TotalCount": "number",
  "Items": [
    {
      "StatusColor": "string",
      "CustomerQuoteId": "number",
      "CustomerInformationId": "null",
      "HomeServiceInformationId": "null",
      "HomeInformationId": "null",
      "FirstName": "string",
      "LastName": "string",
      "CustomerCompanyName": "null",
      "Address": "string",
      "Address2": "null",
      "City": "null|string",
      "Region": "null|string",
      "PostalCode": "null|string",
      "Country": "null",
      "UserId": "null",
      "AssignedUserId": "null",
      "AssignedUserName": "null",
      "AssignedDate": "null",
      "QuoteIsNotBooked": "boolean",
      "CanCloseQuote": "boolean",
      "TimeZoneInfoId": "string",
      "IsBooked": "boolean",
      "BookedBy": "string",
      "QuotedBy": "string",
      "BookedDate": "null",
      "RecentBookedDate": "null",
      "RecentQuotedDate": "null|string",
      "LastNoteDate": "string",
      "DateCreated": "string",
      "DateLastModified": "string",
      "Status": "string",
      "StatusId": "number",
      "CreatedBy": "string",
      "CustomerSourceDescription": "string",
      "AgreementDate": "null",
      "AgreementSentDate": "null",
      "CreationSourceType": "number",
      "CreationSourceTypeDescription": "string",
      "HomeSquareFeet": "null",
      "HomePeople": "null",
      "HomePets": "null",
      "HomeFullBathrooms": "null",
      "HomeHalfBathrooms": "null",
      "HomeBedrooms": "null",
      "HomeStories": "null",
      "HomeHasBasement": "null",
      "HomeDirtCode": "null",
      "RequestedService": "null",
      "BusinessType": "null",
      "PreferredStartTime": "null",
      "PreferredEndTime": "null",
      "PreferredServiceDate": "null",
      "HasLeadDetails": "boolean"
    }
  ]
}
```
</details>

#### `GET {tenant}.maidcentral.com/Estimate/Index/:id` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 12×
- Capabilities: leads-quotes
- Pages: `/Estimate/Index/:id`

#### `POST {tenant}.maidcentral.com/Estimate/QuoteDetailsForGroups` [xhr] (read via POST)

- Status: 200 · Auth: cookie · Returns: html · Seen 64×
- Capabilities: leads-quotes
- Pages: `/Estimate/Details/:id`

<details><summary>Request body</summary>

```json
{
  "id": "number"
}
```
</details>

#### `POST {tenant}.maidcentral.com/Estimate/QuoteNotes` [xhr] (read via POST)

- Status: 200 · Auth: cookie · Returns: html · Seen 64×
- Capabilities: leads-quotes, notes-messages
- Pages: `/Estimate/Details/:id`

<details><summary>Request body</summary>

```json
{
  "id": "number"
}
```
</details>

#### `GET {tenant}.maidcentral.com/Estimate/SalesPipeline` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 2×
- Capabilities: leads-quotes
- Pages: `/Estimate/SalesPipeline`, `/Estimate/SalesPipeline?=:date`
- Query: `` (:date)

#### `GET {tenant}.maidcentral.com/Estimate/Search` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 50×
- Capabilities: leads-quotes
- Pages: `/Estimate/Search`

#### `GET {tenant}.maidcentral.com/Estimate/Step1` [page]

- Status: 302 · Auth: cookie · Returns: redirect · Seen 1×
- Capabilities: leads-quotes
- Pages: `/Estimate/Step1`

#### `POST {tenant}.maidcentral.com/Estimate/Step1` [xhr] (blocked during capture: write)

- Status: n/a · Auth: cookie · Returns: n/a · Seen 16×
- Capabilities: leads-quotes
- Pages: `/Estimate#tab_1`, `/Estimate/Index/:id#tab_1`

<details><summary>Request body</summary>

```json
{
  "CustomerInformationId": "string",
  "HomeInformationId": "string",
  "CustomerQuoteId": "number"
}
```
</details>

#### `GET {tenant}.maidcentral.com/Estimate/Step2` [page]

- Status: 302 · Auth: cookie · Returns: redirect · Seen 1×
- Capabilities: leads-quotes
- Pages: `/Estimate/Step2`

#### `GET {tenant}.maidcentral.com/Estimate/Step3` [page]

- Status: 302 · Auth: cookie · Returns: redirect · Seen 1×
- Capabilities: leads-quotes
- Pages: `/Estimate/Step3`

#### `GET {tenant}.maidcentral.com/Estimate/Step4` [page]

- Status: 302 · Auth: cookie · Returns: redirect · Seen 1×
- Capabilities: leads-quotes
- Pages: `/Estimate/Step4`

#### `POST {tenant}.maidcentral.com/Event/CreateOrEditEvent` [xhr] (blocked during capture: write)

- Status: n/a · Auth: cookie · Returns: n/a · Seen 7×
- Pages: `/Job/Monthly`, `/Job/Monthly#sidebar_tab_customer`, `/Job/Monthly#sidebar_tab_employees`, `/Job/Schedule`, `/Job/Schedule#mdlPrintJobs`

<details><summary>Request body</summary>

```json
{
  "eventDate": "string"
}
```
</details>

#### `GET {tenant}.maidcentral.com/Event/EventClocksByEmployee` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 2×
- Capabilities: employees
- Pages: `/Employee/Details/:id#tab_event_history`
- Query: `id` (:id); `_` (:id)

#### `POST {tenant}.maidcentral.com/Event/Events` [xhr] (read via POST)

- Status: 200 · Auth: cookie · Returns: html · Seen 10×
- Pages: `/Employee/Time#breaks-tab`, `/Employee/Time#events-tab`

<details><summary>Request body</summary>

```json
{
  "date": "string"
}
```
</details>

#### `GET {tenant}.maidcentral.com/Feedback` [page]

- Status: 302 · Auth: cookie · Returns: redirect · Seen 2×
- Pages: `/Feedback?j=*`
- Query: `j` (<string>)

#### `GET {tenant}.maidcentral.com/Home` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 2×
- Capabilities: clients
- Pages: `/Home`

#### `GET {tenant}.maidcentral.com/Home/CustomerServiceRequests/` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 6×
- Capabilities: clients
- Pages: `/`, `/#sidebar_tab_customer`, `/Home`
- Query: `_` (:id)

#### `GET {tenant}.maidcentral.com/Home/GetChartData/` [xhr]

- Status: 200 · Auth: cookie · Returns: json · Seen 6×
- Capabilities: clients
- Pages: `/`, `/#sidebar_tab_customer`, `/Home`
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

- Status: 200 · Auth: cookie · Returns: html · Seen 6×
- Capabilities: clients
- Pages: `/`, `/#sidebar_tab_customer`, `/Home`
- Query: `_` (:id)

#### `GET {tenant}.maidcentral.com/Home/OpenContactTickets` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 6×
- Capabilities: clients
- Pages: `/`, `/#sidebar_tab_customer`, `/Home`
- Query: `_` (:id)

#### `GET {tenant}.maidcentral.com/Home/SalesDashboard` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 5×
- Capabilities: clients, reports
- Pages: `/Home/SalesDashboard`

#### `GET {tenant}.maidcentral.com/Home/SalesDashboardSettings` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: clients, reports, settings
- Pages: `/Home/SalesDashboardSettings`

#### `GET {tenant}.maidcentral.com/Home/SalesExternalFormQuotes` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 5×
- Capabilities: clients, leads-quotes
- Pages: `/Home/SalesDashboard`, `/Home/SalesDashboard#sidebar_tab_customer`, `/Home/SalesDashboard#tab_main`
- Query: `_` (:id)

#### `GET {tenant}.maidcentral.com/Home/SalesOpenNotes` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 5×
- Capabilities: clients, notes-messages
- Pages: `/Home/SalesDashboard`, `/Home/SalesDashboard#sidebar_tab_customer`, `/Home/SalesDashboard#tab_main`
- Query: `_` (:id)

#### `GET {tenant}.maidcentral.com/Home/SalesQuotesAction` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 5×
- Capabilities: clients, leads-quotes
- Pages: `/Home/SalesDashboard`, `/Home/SalesDashboard#sidebar_tab_customer`, `/Home/SalesDashboard#tab_main`
- Query: `_` (:id)

#### `GET {tenant}.maidcentral.com/Home/SalesServiceRequests` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 5×
- Capabilities: clients
- Pages: `/Home/SalesDashboard`, `/Home/SalesDashboard#sidebar_tab_customer`, `/Home/SalesDashboard#tab_main`
- Query: `_` (:id)

#### `GET {tenant}.maidcentral.com/Home/Sidebar` [xhr]

- Status: 200 · Auth: cookie · Returns: json · Seen 390×
- Capabilities: clients
- Pages: `/`, `/#sidebar_tab_customer`, `/Campaign`, `/Campaign/CreateAccountCustomerInvite`, `/Campaign/Employee`, `/Campaign/QuoteCampaign`, `/ChangeLog`, `/Communication?id=:id&info=*&typeId=:id`, `/Company/BroadcastMessage`, `/Company/ScheduleExceptions`, `/Company/ScheduleExceptions#sidebar_tab_customer`, `/Company/Settings`, `/Compliance`, `/Customer/Create`, `/Customer/CustomerServiceRequests`, `/Customer/Details/:id?cid=:id`, `/Customer/Search`, `/CustomerSource`, `/Dashboard/Index/:id`, `/Dashboard/Index/:id#sidebar_tab_customer`, `/EmailTemplate`, `/Employee`, `/Employee/Create`, `/Employee/Details/:id`, `/Employee/Profile`, `/Employee/Time#monitor-tab`, `/Employee/Time#sidebar_tab_customer`, `/Estimate#tab_1`, `/Estimate/Details/:id`, `/Estimate/Index/:id#tab_1`, `/Estimate/SalesPipeline?=:date`, `/Estimate/Search`, `/Estimate/Search#sidebar_tab_customer`, `/Estimate/Search#sidebar_tab_employees`, `/Home`, `/Home/SalesDashboard`, `/Home/SalesDashboard#sidebar_tab_customer`, `/Home/SalesDashboard#tab_main`, `/HomeInformation/Details/:id?cid=:id&hid=:id&hsid=:id`, `/HomeInformation/Details/:id?cid=:id&hsid=:id`, `/Invoicing?JobDate=:date`, `/Job/Monthly`, `/Job/Schedule`, `/Job/TeamMonitor`, `/Job/TeamMonitor#sidebar_tab_customer`, `/Job/TeamMonitor#sidebar_tab_employees`, `/Job/TeamMonitor?Date=:date`, `/Job/Worksheet/:id`, `/Notification/DailyNotifications`, `/Property`, `/Property#sidebar_tab_customer`, `/Property/Create`, `/Rates#tab-mods`, `/Report`, `/Report#sidebar_tab_customer`, `/Report/AvailabilityCalendarGroup`, `/Report/CancelledService?EndDate=:date&StartDate=:date`, `/Report/Consistency?EndDate=:date&StartDate=:date`, `/Report/ContactTickets?MaxDateCreatedTimeFilter=:date&MinDateCreatedTimeFilter=:date`, `/Report/CreditCardTransactions?MaxDateTimeFilter=:date&MinDateTimeFilter=:date`, `/Report/CustomerEfficiencyMap`, `/Report/CustomerIncome`, `/Report/CustomerRetention`, `/Report/CustomerScorecardStats`, `/Report/CustomerStats`, `/Report/DailyJobs`, `/Report/DispatchBoard?EndDate=:date&StartDate=:date`, `/Report/DispatchBoard?EndDate=:date&StartDate=:date#sidebar_tab_customer`, `/Report/EmployeeList`, `/Report/EmployeeProductivity`, `/Report/EmployeeStats?End=:date&Start=:date`, `/Report/EmployeeSurveyResponses`, `/Report/EmployeeTurnover`, `/Report/EmployeeTurnoverAnnual`, `/Report/FirstTimeInJobs`, `/Report/GrossProfitByServiceSet`, `/Report/HomeStats`, `/Report/HomeStatsDetail`, `/Report/HomeStatsDiff`, `/Report/HomeStatsTracker`, `/Report/HotSheet`, `/Report/HotSheetNew`, `/Report/Inspections`, `/Report/JobCampaign`, `/Report/JobCountStatusByDate`, `/Report/KeyReport`, `/Report/Kiosk`, `/Report/MasterSchedule`, `/Report/RateAdjustmentUsage?EndDate=:date&StartDate=:date`, `/Report/Rates`, `/Report/RegisteredCustomers`, `/Report/RevenueByWeek`, `/Report/RevenueProductionPlanning`, `/Report/RevenueProductionPlanning#sidebar_tab_customer`, `/Report/RoutingSheet`, `/Report/SalesKpi2`, `/Report/SalesKpi?EndDate=:date&StartDate=:date`, `/Report/ScheduleEfficiencyMap?EndDate=:date&StartDate=:date`, `/Report/ScorecardResults`, `/Report/SpotlightDashboard`, `/Report/SpotlightDashboard#sidebar_tab_customer`, `/Report/TeamMileage`, `/Report/Tickets`, `/Report/TimeChangeRequests?MaxDateFilterId=:date&MinDateFilterId=:date`, `/Report/UtmReport?endDate=:date&startDate=:date`, `/Report/ZipZoneList?EndDate=:date&StartDate=:date`, `/Room`, `/Schedule`, `/Schedule?Date=:date`, `/ServiceCompanyGoal/Create`, `/ServiceCompanyGoal/Quarterly`, `/ServiceCompanyGroup/Authorization`, `/ServiceCompanyGroup/Policies`, `/Settings#tab_general`, `/Settings/Offices#tab_offices`, `/Settings/Partner#tab_billing`, `/Skill`, `/Survey`, `/Tag`, `/Team`, `/User`, `/Webhook/Subscriptions`, `/Zone`
- Query: `_` (:id)

<details><summary>Response shape</summary>

```json
{
  "count": "string",
  "sidebar": "string"
}
```
</details>

#### `GET {tenant}.maidcentral.com/HomeInformation/Details/:id` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 4×
- Pages: `/HomeInformation/Details/:id?cid=:id&hid=:id&hsid=:id`, `/HomeInformation/Details/:id?cid=:id&hsid=:id`
- Query: `cid` (:id); `hsid` (:id); `hid` (:id)

#### `GET {tenant}.maidcentral.com/HomeInformation/Homes` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 26×
- Capabilities: clients
- Pages: `/Customer/Details/:id?cid=:id`
- Query: `id` (:id); `cid` (:id); `_` (:id)

#### `GET {tenant}.maidcentral.com/HomeInformation/HomeServiceInformationStats` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 4×
- Capabilities: reports
- Pages: `/HomeInformation/Details/:id?cid=:id&hid=:id&hsid=:id`, `/HomeInformation/Details/:id?cid=:id&hsid=:id`
- Query: `hsid` (:id); `_` (:id)

#### `GET {tenant}.maidcentral.com/HomeInformation/ImagesPartial` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 4×
- Pages: `/HomeInformation/Details/:id?cid=:id&hid=:id&hsid=:id#tab_images_home`, `/HomeInformation/Details/:id?cid=:id&hsid=:id#tab_images_home`
- Query: `id` (:id); `_` (:id)

#### `GET {tenant}.maidcentral.com/HomeInformation/Inspections` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 4×
- Pages: `/HomeInformation/Details/:id?cid=:id&hid=:id&hsid=:id#tab_inspection_home`, `/HomeInformation/Details/:id?cid=:id&hsid=:id#tab_inspection_home`
- Query: `id` (:id); `_` (:id)

#### `GET {tenant}.maidcentral.com/HomeInformation/ScorecardPartial` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 6×
- Capabilities: billing
- Pages: `/HomeInformation/Details/:id?cid=:id&hid=:id&hsid=:id#tab_scorecard_home`, `/HomeInformation/Details/:id?cid=:id&hsid=:id#tab_scorecard_home`, `/HomeInformation/Details/:id?cid=:id&hsid=:id#tab_service`, `/Job/Worksheet/:id#tab_scorecards`
- Query: `id` (:id); `_` (:id)

#### `GET {tenant}.maidcentral.com/HomeInformation/ServiceSets` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 4×
- Pages: `/HomeInformation/Details/:id?cid=:id&hid=:id&hsid=:id`, `/HomeInformation/Details/:id?cid=:id&hsid=:id`
- Query: `id` (:id); `_` (:id)

#### `GET {tenant}.maidcentral.com/HomeInformation/TechHistory` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 4×
- Pages: `/HomeInformation/Details/:id?cid=:id&hid=:id&hsid=:id#tab_tech_home`, `/HomeInformation/Details/:id?cid=:id&hsid=:id#tab_tech_home`
- Query: `id` (:id); `_` (:id)

#### `POST {tenant}.maidcentral.com/HomeServiceInformation/Jobs` [xhr] (read via POST)

- Status: 200 · Auth: cookie · Returns: json · Seen 4×
- Capabilities: jobs
- Pages: `/HomeInformation/Details/:id?cid=:id&hid=:id&hsid=:id#tab_schedule`, `/HomeInformation/Details/:id?cid=:id&hid=:id&hsid=:id#tab_service`, `/HomeInformation/Details/:id?cid=:id&hsid=:id#tab_schedule`

<details><summary>Request body</summary>

```json
{
  "id": "string",
  "start": "string",
  "end": "string"
}
```
</details>

<details><summary>Response shape</summary>

```json
[
  {
    "url": "null",
    "late": "boolean",
    "outOfRotation": "boolean",
    "description": "null",
    "id": "string",
    "title": "null",
    "date": "string",
    "start": "string",
    "end": "string",
    "color": "string",
    "textColor": "null",
    "allDay": "boolean",
    "editable": "boolean"
  }
]
```
</details>

#### `GET {tenant}.maidcentral.com/Invoicing` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Pages: `/Invoicing`

#### `GET {tenant}.maidcentral.com/Job` [page]

- Status: 301 · Auth: cookie · Returns: redirect · Seen 1×
- Capabilities: jobs
- Pages: `/Job`

#### `GET {tenant}.maidcentral.com/Job/AdjustTeamSize` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 4×
- Capabilities: jobs, teams
- Pages: `/Job/Schedule`, `/Job/Schedule#mdlPrintJobs`
- Query: `Date` (:date); `_` (:id)
- Returns form `POST /Job/AdjustTeamSize`: `Date:hidden`, `<key>:hidden`, `<key>:text`

#### `GET {tenant}.maidcentral.com/Job/CheckNextJobNotificationOnWay` [xhr]

- Status: 200 · Auth: cookie · Returns: json · Seen 8×
- Capabilities: jobs, notes-messages
- Pages: `/Employee/Dashboard`, `/Job/Worksheet/:id`
- Query: `eid` (:id); `date` (<string>); `jobId` (); `_` (:id)

<details><summary>Response shape</summary>

```json
{
  "showModal": "boolean"
}
```
</details>

#### `POST {tenant}.maidcentral.com/Job/CustomerEmployeeFlags/` [xhr] (read via POST)

- Status: 200 · Auth: cookie · Returns: html · Seen 15×
- Capabilities: clients, jobs, employees
- Pages: `/Job/Schedule`, `/Schedule`, `/Schedule?Date=:date`

<details><summary>Request body</summary>

```json
{
  "date": "string"
}
```
</details>

#### `GET {tenant}.maidcentral.com/Job/GetContactTicketModal/` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 2×
- Capabilities: clients, jobs
- Pages: `/Job/Worksheet/:id`
- Query: `id` (:id); `typeId` (:id); `_` (:id)
- Returns form `POST /Job/CreateContactTicket`: `__RequestVerificationToken:hidden`, `JobInformationId:hidden`, `ContactTicketTypeId:hidden`, `ServiceSetInformationId:hidden`, `OpenDate:hidden`, `Notes:textarea`

#### `POST {tenant}.maidcentral.com/Job/JobResendNotificationFlags/` [xhr] (blocked during capture: write)

- Status: n/a · Auth: cookie · Returns: n/a · Seen 7×
- Capabilities: jobs, notes-messages
- Pages: `/Job/Schedule`, `/Job/Schedule?Date=:date`

<details><summary>Request body</summary>

```json
{
  "date": "string"
}
```
</details>

#### `GET {tenant}.maidcentral.com/Job/Monthly` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 2×
- Capabilities: jobs
- Pages: `/Job/Monthly`

#### `POST {tenant}.maidcentral.com/Job/MonthlyData` [xhr] (read via POST)

- Status: 200 · Auth: cookie · Returns: json · Seen 2×
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

<details><summary>Response shape</summary>

```json
[
  {
    "IsEvent": "boolean",
    "id": "string",
    "title": "string",
    "description": "string",
    "date": "string",
    "start": "string",
    "end": "string",
    "color": "string",
    "textColor": "string",
    "allDay": "boolean",
    "editable": "boolean"
  }
]
```
</details>

#### `POST {tenant}.maidcentral.com/Job/PreferExcludeFlags/` [xhr] (read via POST)

- Status: 200 · Auth: cookie · Returns: html · Seen 6×
- Capabilities: jobs
- Pages: `/Job/Schedule`, `/Job/Schedule?Date=:date`

<details><summary>Request body</summary>

```json
{
  "date": "string"
}
```
</details>

#### `GET {tenant}.maidcentral.com/Job/RateModificationsByJob` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 6×
- Capabilities: jobs, pricing
- Pages: `/Job/Worksheet/:id`
- Query: `id` (:id); `_` (:id)

#### `GET {tenant}.maidcentral.com/Job/ReadJobs` [xhr]

- Status: 200 · Auth: cookie · Returns: json · Seen 5×
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

- Status: 200 · Auth: cookie · Returns: json · Seen 7×
- Capabilities: jobs, teams
- Pages: `/Job/Schedule`, `/Job/Schedule?Date=:date`
- Query: `date` (:date, <string>); `view` (<string>); `_` (:id)

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

- Status: 200 · Auth: cookie · Returns: html · Seen 6×
- Capabilities: jobs, scheduling
- Pages: `/Job/Schedule`

#### `POST {tenant}.maidcentral.com/Job/ScheduleStats/` [xhr] (read via POST)

- Status: 200 · Auth: cookie · Returns: json · Seen 7×
- Capabilities: jobs, scheduling, reports
- Pages: `/Job/Schedule`, `/Job/Schedule?Date=:date`

<details><summary>Request body</summary>

```json
{
  "date": "string"
}
```
</details>

<details><summary>Response shape</summary>

```json
{
  "summary": "string",
  "teams": [
    {
      "TeamID": "number",
      "value": "number",
      "TeamName": "null",
      "text": "null",
      "Color": "null",
      "RgbBackgroundColor": "null",
      "RgbTextColor": "null",
      "TeamMembers": "null",
      "SizeException": "boolean",
      "SortOrder": "number",
      "SizeExceptionValue": "number",
      "BillRate": "string",
      "ScheduledHours": "number",
      "CountJobs": "number",
      "Employees": "null",
      "AllowedHours": "number",
      "ServiceCompanyOfficeId": "null",
      "IsDisabled": "boolean"
    }
  ]
}
```
</details>

#### `GET {tenant}.maidcentral.com/Job/TeamMonitor` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 7×
- Capabilities: jobs, teams
- Pages: `/Job/TeamMonitor`, `/Job/TeamMonitor?Date=:date`
- Query: `Date` (:date)

#### `GET {tenant}.maidcentral.com/Job/TeamMonitorData` [xhr]

- Status: 200 · Auth: cookie · Returns: json · Seen 10×
- Capabilities: jobs, teams
- Pages: `/Job/TeamMonitor`, `/Job/TeamMonitor#sidebar_tab_customer`, `/Job/TeamMonitor#sidebar_tab_employees`, `/Job/TeamMonitor?Date=:date`
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

- Status: 200 · Auth: cookie · Returns: json · Seen 12×
- Capabilities: jobs, teams
- Pages: `/Job/TeamMonitor`, `/Job/TeamMonitor#sidebar_tab_customer`, `/Job/TeamMonitor#sidebar_tab_employees`, `/Job/TeamMonitor?Date=:date`
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

#### `GET {tenant}.maidcentral.com/Job/TechNotesPartial/` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 6×
- Capabilities: jobs, notes-messages
- Pages: `/Job/Worksheet/:id`
- Query: `id` (:id); `_` (:id)

#### `GET {tenant}.maidcentral.com/Job/Worksheet/:id` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 6×
- Capabilities: jobs
- Pages: `/Job/Worksheet/:id`

#### `GET {tenant}.maidcentral.com/Manage/ChangePassword` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Pages: `/Employee/Profile#tab_change_password`
- Query: `_` (:id)
- Returns form `POST /Manage/ChangePassword`: `__RequestVerificationToken:hidden`, `OldPassword:password`, `NewPassword:password`, `ConfirmPassword:password`

#### `POST {tenant}.maidcentral.com/Note/GetNoteModal` [xhr] (read via POST)

- Status: 200 · Auth: cookie · Returns: html · Seen 4×
- Capabilities: notes-messages
- Pages: `/Estimate/Details/:id`
- Returns form `GET (same)`: `RecordId:hidden`, `CustomerQuoteDetailGroupId:hidden`, `DataType:hidden`, `QuoteStatusId:hidden`, `TemplateTypeId:hidden`, `DefaultTemplateId:hidden`, `JobInformationId:hidden`, `QbInvoiceId:hidden`, `CancelRedirectUrl:hidden`, `SubmitRedirectUrl:hidden`, `CloseTicketId:hidden`, `TicketTypeId:hidden`, `NoteTypeId:select-one`, `OpenDate:text`, `To:select-multiple`, `ReplyTo:select-one`, `Subject:text`, `Body:textarea`

<details><summary>Request body</summary>

```json
{
  "recordId": "string",
  "dataType": "string",
  "quoteStatusId": "string",
  "noteTypeId": "string",
  "autoSelectFirstContact": "string"
}
```
</details>

#### `GET {tenant}.maidcentral.com/Notification/ContactInfoNotification/:id` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 2×
- Capabilities: clients, notes-messages
- Pages: `/Customer/Details/:id?cid=:id#tab_contacts`
- Query: `onlyReturnContactList` (<string>); `_` (:id)

#### `GET {tenant}.maidcentral.com/Notification/DailyNotifications` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: notes-messages
- Pages: `/Notification/DailyNotifications`

#### `GET {tenant}.maidcentral.com/Portal/Feedback` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 2×
- Pages: `/Portal/Feedback?j=*`
- Query: `j` (<string>)

#### `GET {tenant}.maidcentral.com/Portal/Layout/Footer/:id` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 2×
- Pages: `/Portal/Feedback?j=*`

#### `GET {tenant}.maidcentral.com/Property` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 3×
- Capabilities: clients
- Pages: `/Property`

#### `GET {tenant}.maidcentral.com/Property/Create` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: clients
- Pages: `/Property/Create`

#### `GET {tenant}.maidcentral.com/ProviderStatus/Current` [xhr]

- Status: 200 · Auth: cookie · Returns: json · Seen 92×
- Capabilities: reports
- Pages: `/Campaign`, `/Campaign/CreateAccountCustomerInvite`, `/Campaign/Employee`, `/Campaign/QuoteCampaign`, `/Company/BroadcastMessage`, `/Company/ScheduleExceptions`, `/Company/ScheduleExceptions#sidebar_tab_customer`, `/Company/Settings`, `/Customer/Create`, `/Customer/CustomerServiceRequests`, `/Customer/Details/:id?cid=:id`, `/Customer/Search`, `/CustomerSource`, `/Invoicing?JobDate=:date`, `/Job/Monthly`, `/Job/Schedule`, `/Job/Schedule#mdlPrintJobs`, `/Job/TeamMonitor`, `/Job/TeamMonitor#sidebar_tab_customer`, `/Job/TeamMonitor#sidebar_tab_employees`, `/Job/TeamMonitor?Date=:date`, `/Job/Worksheet/:id`, `/Notification/DailyNotifications`, `/Report/CustomerEfficiencyMap`, `/Report/CustomerIncome`, `/Report/CustomerRetention`, `/Report/CustomerScorecardStats`, `/Report/CustomerStats`, `/Report/JobCampaign`, `/Report/JobCountStatusByDate`, `/Report/ScorecardResults`

<details><summary>Response shape</summary>

```json
[]
```
</details>

#### `GET {tenant}.maidcentral.com/Question` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Pages: `/Settings#tab_question`
- Query: `partial` (true); `_` (:id)

#### `GET {tenant}.maidcentral.com/Quote/CustomerQuotes/:id` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 2×
- Capabilities: clients, leads-quotes
- Pages: `/Customer/Details/:id?cid=:id#tab_quotes`
- Query: `_` (:id)

#### `GET {tenant}.maidcentral.com/Quote/Details/:id` [page]

- Status: 302 · Auth: cookie · Returns: redirect · Seen 2×
- Capabilities: leads-quotes
- Pages: `/Quote/Details/:id`

#### `POST {tenant}.maidcentral.com/Quote/GetStatusSteps` [xhr] (read via POST)

- Status: 200 · Auth: cookie · Returns: html · Seen 64×
- Capabilities: leads-quotes, reports
- Pages: `/Estimate/Details/:id`

<details><summary>Request body</summary>

```json
{
  "CustomerQuoteId": "number"
}
```
</details>

#### `GET {tenant}.maidcentral.com/Rates` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: pricing
- Pages: `/Rates`

#### `GET {tenant}.maidcentral.com/Rates/BulkRateModifications` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 2×
- Capabilities: pricing
- Pages: `/Rates#tab-mods`
- Query: `_` (:id)
- Returns form `GET (same)`: `TemplateTypeId:hidden`, `RateModificationId:select-one`, `StartDate:text`, `RateModificationBulkChangeType:radio`, `ZonesSelected:checkbox`, `BillingTermsId:select-one`, `ZipCodes:select-multiple`

#### `GET {tenant}.maidcentral.com/rates/GetRatesByServiceSetInformationId` [xhr]

- Status: 200 · Auth: cookie · Returns: json · Seen 4×
- Capabilities: pricing
- Pages: `/HomeInformation/Details/:id?cid=:id&hid=:id&hsid=:id#tab_service`, `/HomeInformation/Details/:id?cid=:id&hsid=:id#tab_service`
- Query: `serviceSetInformationId` (:id); `sorting` (<string>); `maxResultCount` (:id); `_` (:id)

<details><summary>Response shape</summary>

```json
{
  "TotalCount": "number",
  "Items": [
    {
      "Name": "string",
      "Description": "string",
      "Frequency": "string",
      "Amount": "number",
      "AllowedTime": "number",
      "FeeSplit": "boolean",
      "CanDelete": "boolean",
      "CanEdit": "boolean",
      "UiAmount": "string",
      "Hours": "number",
      "MinutesOnly": "number",
      "HoursOnly": "number",
      "IsPercentageBase": "boolean",
      "CostCalc": "number",
      "AllowedTimeCalc": "number",
      "AllowedTimeCalcPercent": "null",
      "CostCalcPercent": "null",
      "IsActive": "boolean",
      "RateModificationBulkId": "null",
      "RateModificationId": "null",
      "StartDate": "string",
      "EndDate": "string",
      "IsCustomRateMod": "boolean",
      "RateTypeName": "string",
      "HourlyRate": "number",
      "Id": "number",
      "RateListType": "number",
      "LoggedInEmail": "null",
      "UserId": "null",
      "ServiceCompanyId": "null"
    }
  ]
}
```
</details>

#### `GET {tenant}.maidcentral.com/Referral/Go` [page]

- Status: 302 · Auth: cookie · Returns: redirect · Seen 1×
- Pages: `/Referral/Go`

#### `GET {tenant}.maidcentral.com/Report` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 3×
- Capabilities: reports
- Pages: `/Report`

#### `GET {tenant}.maidcentral.com/Report/ActivityPipeline` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 8×
- Capabilities: reports
- Pages: `/Report/Kiosk`, `/Report/Kiosk#revenue_report_1`, `/Report/Kiosk#revenue_report_2`, `/Report/Kiosk#revenue_report_3`, `/Report/Kiosk#revenue_report_4`, `/Report/Kiosk#revenue_report_5`, `/Report/Kiosk#sidebar_tab_customer`, `/Report/Kiosk#sidebar_tab_employees`
- Query: `_` (:id)
- Returns form `POST /Report/ActivityPipeline`: `StartDate:text`, `EndDate:text`, `HideUsers:checkbox`, `HideUsers:hidden`

#### `GET {tenant}.maidcentral.com/Report/AvailabilityCalendar` [page]

- Status: 302 · Auth: cookie · Returns: redirect · Seen 1×
- Capabilities: scheduling, reports
- Pages: `/Report/AvailabilityCalendar`

#### `GET {tenant}.maidcentral.com/Report/AvailabilityCalendarGroup` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 3×
- Capabilities: scheduling, reports
- Pages: `/Report/AvailabilityCalendarGroup`

#### `GET {tenant}.maidcentral.com/report/bidata` [xhr]

- Status: 200 · Auth: cookie · Returns: json · Seen 6×
- Capabilities: reports
- Pages: `/`, `/#sidebar_tab_customer`, `/Home`
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

#### `GET {tenant}.maidcentral.com/Report/CancelledService` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 4×
- Capabilities: reports
- Pages: `/Report/CancelledService`, `/Report/CancelledService?EndDate=:date&StartDate=:date`
- Query: `StartDate` (:date); `EndDate` (:date)

#### `GET {tenant}.maidcentral.com/Report/Consistency` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: reports
- Pages: `/Report/Consistency`

#### `GET {tenant}.maidcentral.com/Report/ContactTickets` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: clients, reports
- Pages: `/Report/ContactTickets`

#### `GET {tenant}.maidcentral.com/Report/CreditCardTransactions` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: billing, reports
- Pages: `/Report/CreditCardTransactions`

#### `GET {tenant}.maidcentral.com/Report/CustomerEfficiencyMap` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: clients, reports
- Pages: `/Report/CustomerEfficiencyMap`

#### `GET {tenant}.maidcentral.com/Report/CustomerIncome` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: clients, reports
- Pages: `/Report/CustomerIncome`

#### `GET {tenant}.maidcentral.com/Report/CustomerRetention` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: clients, reports
- Pages: `/Report/CustomerRetention`

#### `GET {tenant}.maidcentral.com/Report/CustomerScorecardStats` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: clients, billing, reports
- Pages: `/Report/CustomerScorecardStats`

#### `GET {tenant}.maidcentral.com/Report/CustomerStats` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: clients, reports
- Pages: `/Report/CustomerStats`

#### `GET {tenant}.maidcentral.com/Report/DailyJobs` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: jobs, reports
- Pages: `/Report/DailyJobs`

#### `GET {tenant}.maidcentral.com/Report/DispatchBoard` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 3×
- Capabilities: scheduling, reports
- Pages: `/Report/DispatchBoard`, `/Report/DispatchBoard?EndDate=:date&StartDate=:date`
- Query: `StartDate` (:date); `EndDate` (:date)

#### `GET {tenant}.maidcentral.com/Report/EmployeeList` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: employees, reports
- Pages: `/Report/EmployeeList`

#### `GET {tenant}.maidcentral.com/Report/EmployeeProductivity` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: employees, reports
- Pages: `/Report/EmployeeProductivity`

#### `GET {tenant}.maidcentral.com/Report/EmployeeStats` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: employees, reports
- Pages: `/Report/EmployeeStats`

#### `GET {tenant}.maidcentral.com/Report/EmployeeSurveyResponses` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: employees, reports
- Pages: `/Report/EmployeeSurveyResponses`

#### `GET {tenant}.maidcentral.com/Report/EmployeeTurnover` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: employees, reports
- Pages: `/Report/EmployeeTurnover`

#### `GET {tenant}.maidcentral.com/Report/EmployeeTurnoverAnnual` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: employees, reports
- Pages: `/Report/EmployeeTurnoverAnnual`

#### `GET {tenant}.maidcentral.com/Report/FirstTimeInJobs` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: jobs, reports
- Pages: `/Report/FirstTimeInJobs`

#### `POST {tenant}.maidcentral.com/report/getCreditCardTransactions` [xhr] (read via POST)

- Status: 200 · Auth: cookie · Returns: json · Seen 1×
- Capabilities: billing, reports
- Pages: `/Report/CreditCardTransactions?MaxDateTimeFilter=:date&MinDateTimeFilter=:date`
- Query: `tableFilter` (); `minDateTimeFilter` (:date); `maxDateTimeFilter` (:date); `minAmountFilter` (); `maxAmountFilter` (); `sorting` (<string>); `skipCount` (:id); `maxResultCount` (:id)

<details><summary>Response shape</summary>

```json
{
  "TotalCount": "number",
  "Items": [
    {
      "CreditCardChargeId": "number",
      "ServiceCompanyId": "number",
      "CustomerFirstName": "string",
      "CustomerLastName": "string",
      "EmployeeInformationId": "null|number",
      "EmployeeFirstName": "string",
      "EmployeeLastName": "string",
      "ChargedBy": "null|string",
      "CustomerInformationId": "number",
      "JobInformationId": "number",
      "JobDate": "string",
      "JobDateString": "string",
      "Amount": "number",
      "Processor": "string",
      "ProcessorPaymentId": "string",
      "QbPaymentId": "string",
      "QbPaymentDocNumber": "null",
      "QbPaymentDocNumberCheckedDate": "null",
      "SurchargeCheckedDate": "null",
      "QbDepositId": "null",
      "DateCreated": "string",
      "Area": "string",
      "ChargeStatusId": "null",
      "Status": "string",
      "AcctType": "null",
      "Url": "null",
      "SurchargeAmount": "number",
      "TotalAmountWithSurcharge": "number",
      "AmountAdjusted": "null",
      "RefundableAmount": "number"
    }
  ]
}
```
</details>

#### `GET {tenant}.maidcentral.com/Report/GetDataTableState` [xhr]

- Status: 200 · Auth: cookie · Returns: json · Seen 1×
- Capabilities: reports
- Pages: `/Report/EmployeeStats`
- Query: `id` (<string>); `url` (<string>); `_` (:id)

<details><summary>Response shape</summary>

```json
"string"
```
</details>

#### `GET {tenant}.maidcentral.com/Report/GetSalesActivtyServiceCompany` [xhr]

- Status: 200 · Auth: cookie · Returns: json · Seen 8×
- Capabilities: reports, settings
- Pages: `/Report/Kiosk#revenue_report_1`, `/Report/Kiosk#revenue_report_2`, `/Report/Kiosk#revenue_report_3`, `/Report/Kiosk#revenue_report_4`, `/Report/Kiosk#revenue_report_5`, `/Report/Kiosk#sidebar_tab_customer`, `/Report/Kiosk#sidebar_tab_employees`
- Query: `_` (:id)

<details><summary>Response shape</summary>

```json
{
  "categories": [
    "string"
  ],
  "series": [
    {
      "name": "string",
      "employeeId": "number",
      "color": "string",
      "type": "null",
      "data": [
        "number"
      ],
      "yAxis": "number",
      "tooltip": "null"
    }
  ]
}
```
</details>

#### `GET {tenant}.maidcentral.com/Report/GetSalesServiceCompany` [xhr]

- Status: 200 · Auth: cookie · Returns: json · Seen 8×
- Capabilities: reports, settings
- Pages: `/Report/Kiosk`, `/Report/Kiosk#revenue_report_1`, `/Report/Kiosk#revenue_report_2`, `/Report/Kiosk#revenue_report_3`, `/Report/Kiosk#revenue_report_4`, `/Report/Kiosk#revenue_report_5`, `/Report/Kiosk#sidebar_tab_customer`, `/Report/Kiosk#sidebar_tab_employees`
- Query: `_` (:id)

<details><summary>Response shape</summary>

```json
{
  "categories": [
    "string"
  ],
  "series": [
    {
      "name": "string",
      "employeeId": "number",
      "color": "string",
      "type": "null",
      "data": [
        "number"
      ],
      "yAxis": "number",
      "tooltip": "null"
    }
  ]
}
```
</details>

#### `POST {tenant}.maidcentral.com/report/getTickets` [xhr] (read via POST)

- Status: 200 · Auth: cookie · Returns: json · Seen 1×
- Capabilities: reports
- Pages: `/Report/Tickets`
- Query: `tableFilter` (); `closedByFilter` (); `firstNameFilter` (); `lastNameFilter` (); `minDateCreatedTimeFilter` (); `maxDateCreatedTimeFilter` (); `minDateOpenTimeFilter` (); `maxDateOpenTimeFilter` (); `minDateClosedTimeFilter` (); `maxDateClosedTimeFilter` (); `statusSelected[0]` (:id); `typesSelected` (); `sorting` (<string>); `skipCount` (:id); `maxResultCount` (:id)

<details><summary>Response shape</summary>

```json
{
  "TotalCount": "number",
  "Items": []
}
```
</details>

#### `POST {tenant}.maidcentral.com/report/getTimeChangeRequests` [xhr] (read via POST)

- Status: 200 · Auth: cookie · Returns: json · Seen 11×
- Capabilities: reports
- Pages: `/Employee/Time#monitor-tab`, `/Employee/Time#requests-tab`, `/Employee/Time#timeclocks-tab`, `/Report/TimeChangeRequests?MaxDateFilterId=:date&MinDateFilterId=:date`
- Query: `minDateFilter` (<string>); `maxDateFilter` (<string>); `sorting` (<string>); `skipCount` (:id); `maxResultCount` (:id); `MinDateFilterId` (:date); `MaxDateFilterId` (:date); `StatusSelected` (<string>); `TypesSelected` (:id)

<details><summary>Response shape</summary>

```json
{
  "TotalCount": "number",
  "Items": [
    {
      "IsCreatedByEmployee": "boolean",
      "EmployeeActionRequired": "boolean",
      "FirstName": "string",
      "LastName": "string",
      "Comments": "null|string",
      "StatusId": "number",
      "EmployeeInformationId": "number",
      "JobInformationId": "null|number",
      "EmployeeTimeClockId": "null|number",
      "Id": "number",
      "Date": "string",
      "ChangeRequestType": "number",
      "DateCreated": "string",
      "DateLastModified": "string",
      "TypeDescription": "string",
      "StatusDescription": "string",
      "StartTime": "string",
      "EndTime": "null|string",
      "OriginalStartTime": "string",
      "OriginalEndTime": "null|string",
      "IsApiRequestOpen": "boolean",
      "CreatedBy": "string",
      "CreatedByName": "string",
      "LastModifiedBy": "string",
      "EmployeeUserId": "string",
      "CustomerName": "string",
      "HomeName": "string",
      "LoggedInEmployeeId": "null",
      "StatusColor": "string"
    }
  ]
}
```
</details>

#### `GET {tenant}.maidcentral.com/Report/GrossProfitByServiceSet` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: reports
- Pages: `/Report/GrossProfitByServiceSet`

#### `GET {tenant}.maidcentral.com/Report/HomeStats` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: reports
- Pages: `/Report/HomeStats`

#### `GET {tenant}.maidcentral.com/Report/HomeStatsDetail` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: reports
- Pages: `/Report/HomeStatsDetail`

#### `GET {tenant}.maidcentral.com/Report/HomeStatsDiff` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: reports
- Pages: `/Report/HomeStatsDiff`

#### `GET {tenant}.maidcentral.com/Report/HomeStatsTracker` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: reports
- Pages: `/Report/HomeStatsTracker`

#### `GET {tenant}.maidcentral.com/Report/HotSheet` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: reports
- Pages: `/Report/HotSheet`

#### `GET {tenant}.maidcentral.com/Report/HotSheetNew` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: reports
- Pages: `/Report/HotSheetNew`

#### `GET {tenant}.maidcentral.com/Report/Inspections` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: reports
- Pages: `/Report/Inspections`

#### `GET {tenant}.maidcentral.com/Report/JobCampaign` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: jobs, reports
- Pages: `/Report/JobCampaign`

#### `GET {tenant}.maidcentral.com/Report/JobCountStatusByDate` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 3×
- Capabilities: jobs, reports
- Pages: `/Report/JobCountStatusByDate`

#### `GET {tenant}.maidcentral.com/Report/KeyReport` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: reports
- Pages: `/Report/KeyReport`

#### `GET {tenant}.maidcentral.com/Report/Kiosk` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 7×
- Capabilities: reports
- Pages: `/Report/Kiosk`

#### `GET {tenant}.maidcentral.com/Report/KioskSettings` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: reports, settings
- Pages: `/Report/KioskSettings`

#### `GET {tenant}.maidcentral.com/Report/MasterSchedule` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 8×
- Capabilities: scheduling, reports
- Pages: `/Report/MasterSchedule`

#### `GET {tenant}.maidcentral.com/Report/RateAdjustmentUsage` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 3×
- Capabilities: pricing, reports
- Pages: `/Report/RateAdjustmentUsage`, `/Report/RateAdjustmentUsage?EndDate=:date&StartDate=:date`
- Query: `StartDate` (:date); `EndDate` (:date)

#### `POST {tenant}.maidcentral.com/Report/RateReport` [xhr] (read via POST)

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: pricing, reports
- Pages: `/Report/Rates#tb-summary`

#### `GET {tenant}.maidcentral.com/Report/Rates` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 6×
- Capabilities: pricing, reports
- Pages: `/Rates#tab-mods`, `/Report/Rates`

#### `GET {tenant}.maidcentral.com/Report/RegisteredCustomers` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: clients, reports
- Pages: `/Report/RegisteredCustomers`

#### `GET {tenant}.maidcentral.com/Report/RevenueByWeek` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: reports
- Pages: `/Report/RevenueByWeek`

#### `GET {tenant}.maidcentral.com/Report/RevenueFuture` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 9×
- Capabilities: reports
- Pages: `/Report/Kiosk`, `/Report/Kiosk#revenue_report_1`, `/Report/Kiosk#revenue_report_3`, `/Report/Kiosk#revenue_report_4`, `/Report/Kiosk#revenue_report_5`, `/Report/Kiosk#sidebar_tab_customer`, `/Report/Kiosk#sidebar_tab_employees`
- Query: `_` (:id)

#### `GET {tenant}.maidcentral.com/Report/RevenuePast` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 15×
- Capabilities: reports
- Pages: `/Report/Kiosk`, `/Report/Kiosk#revenue_report_2`, `/Report/Kiosk#revenue_report_3`, `/Report/Kiosk#revenue_report_4`, `/Report/Kiosk#revenue_report_5`, `/Report/Kiosk#sidebar_tab_customer`, `/Report/Kiosk#sidebar_tab_employees`
- Query: `_` (:id)

#### `GET {tenant}.maidcentral.com/Report/RevenueProductionPlanning` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 3×
- Capabilities: reports
- Pages: `/Report/RevenueProductionPlanning`

#### `GET {tenant}.maidcentral.com/Report/RoutingSheet` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: reports
- Pages: `/Report/RoutingSheet`

#### `GET {tenant}.maidcentral.com/Report/SalesKpi` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 2×
- Capabilities: reports
- Pages: `/Report/SalesKpi`, `/Report/SalesKpi?EndDate=:date&StartDate=:date`
- Query: `StartDate` (:date); `EndDate` (:date)

#### `GET {tenant}.maidcentral.com/Report/SalesKpi2` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 2×
- Capabilities: reports
- Pages: `/Report/SalesKpi2`

#### `GET {tenant}.maidcentral.com/Report/SalesKpiEmployeeList` [xhr]

- Status: 200 · Auth: cookie · Returns: json · Seen 2×
- Capabilities: employees, reports
- Pages: `/Report/SalesKpi2`
- Query: `StartDate` (<string>); `EndDate` (<string>); `ServiceSetDifferencesId` (:id)

<details><summary>Response shape</summary>

```json
{
  "Employees": [
    {
      "Id": "string",
      "ServiceCompanyId": "number",
      "EmployeeInformationId": "number",
      "UserId": "null|string",
      "FirstName": "string",
      "LastName": "string",
      "PhotoUrl": "null",
      "Bio": "null",
      "FullName": "string",
      "Initials": "string",
      "Leads": "number",
      "Quotes": "number",
      "Sales": "number",
      "Revenue": "number",
      "SalesRecurring": "number",
      "SalesOneTime": "number",
      "SalesTotal": "number",
      "LossRecurring": "number",
      "LossOneTime": "number",
      "LossTotal": "number",
      "WeeklyRevenue": "number",
      "WeeklyRevenueVal": "number",
      "LossRecurringRevenue": "number",
      "LossOneTimeRevenue": "number",
      "QuoteTolead": "number",
      "SalesToQuote": "number",
      "IsVisible": "boolean"
    }
  ],
  "UpdatedByEmployeeFullName": "null",
  "DateLastModified": "null"
}
```
</details>

#### `GET {tenant}.maidcentral.com/Report/SalesKpiJson` [xhr]

- Status: 200 · Auth: cookie · Returns: json · Seen 2×
- Capabilities: reports
- Pages: `/Report/SalesKpi2`
- Query: `StartDate` (<string>); `EndDate` (<string>)

<details><summary>Response shape</summary>

```json
{
  "ServiceCompanyGroupId": "number",
  "StartDate": "string",
  "EndDate": "string",
  "ServiceCompanies": [
    {
      "Id": "string",
      "ServiceCompanyId": "number",
      "ServiceCompanyName": "string",
      "TimeZoneInfoId": "string",
      "RecurringSalesGoal": "number",
      "RecurringSalesRevenueGoal": "number"
    }
  ],
  "Employees": [
    {
      "Id": "string",
      "ServiceCompanyId": "number",
      "EmployeeInformationId": "number",
      "UserId": "string",
      "FirstName": "string",
      "LastName": "string",
      "PhotoUrl": "null",
      "Bio": "null",
      "FullName": "string",
      "Initials": "string",
      "Leads": "number",
      "Quotes": "number",
      "Sales": "number",
      "Revenue": "number",
      "SalesRecurring": "number",
      "SalesOneTime": "number",
      "SalesTotal": "number",
      "LossRecurring": "number",
      "LossOneTime": "number",
      "LossTotal": "number",
      "WeeklyRevenue": "number",
      "WeeklyRevenueVal": "number",
      "LossRecurringRevenue": "number",
      "LossOneTimeRevenue": "number",
      "QuoteTolead": "number",
      "SalesToQuote": "number",
      "IsVisible": "boolean"
    }
  ],
  "ServiceSetTypeGroups": [],
  "SalesKpiItems": [
    {
      "ServiceSetDifferencesId": "number",
      "ServiceCompanyId": "number",
      "ServiceCompanyName": "string",
      "ServiceCompanyTimeZoneInfoId": "string",
      "CustomerQuoteId": "number",
      "CustomerFirstName": "string",
      "CustomerLastName": "string",
      "ServiceSetInformationId": "number",
      "ServiceSetTypeId": "number",
      "ServiceSetTypeDescription": "null",
      "ServiceSetTypeGroupId": "number",
      "ServiceSetTypeGroupName": "null",
      "CustomerInformationId": "null",
      "QuoteStatusId": "number",
      "QuoteStatusName": "string",
      "DateCreated": "string",
      "LocalDate": "string",
      "CreatedByUserId": "string",
      "CreatedByFirstName": "string",
      "CreatedByLastName": "string",
      "SoldByUserId": "null",
      "SoldByFirstName": "null",
      "SoldByLastName": "null",
      "CustomerSourceId": "number",
      "CustomerSourceName": "string",
      "ServiceTypeId": "null",
      "ServiceDescription": "null",
      "BillRate": "number",
      "CreatedByFullName": "string",
      "SoldByFullName": "string",
      "WeeklyRevenue": "number",
      "HomeServiceInformationId": "number",
      "HomeName": "null",
      "CustomerSourceDescription": "null",
      "UtmSource": "null",
      "UtmMedium": "null",
      "UtmCampaign": "null"
    }
  ],
  "CompanyMetrics": [
    {
      "ServiceCompanyId": "number",
      "ServiceCompanyName": "string",
      "Leads": "number",
      "Quotes": "number",
      "SalesOneTime": "number",
      "SalesRecurring": "number",
      "SalesTotal": "number",
      "LossOneTime": "number",
      "LossRecurring": "number",
      "LossTotal": "number",
      "NetGain": "number",
      "SalesOneTimeRevenue": "number",
      "SalesRecurringRevenue": "number",
      "SalesTotalRevenue": "number",
      "LossRecurringRevenue": "number",
      "LossOneTimeRevenue": "number",
      "NetGainRevenue": "number",
      "QuoteToLead": "number",
      "SalesToQuoteOneTime": "number",
      "SalesToQuoteRecurring": "number",
      "SalesToQuoteTotal": "number",
      "SalesToLeadOneTime": "number",
      "SalesToLeadRecurring": "number",
      "SalesToLeadTotal": "number"
    }
  ],
  "CanEditBookedBy": "boolean",
  "ShowUtm": "boolean",
  "WidgetId": "null",
  "WidgetTypeId": "null",
  "WidgetTitle": "null",
  "WidgetSubTitle": "null"
}
```
</details>

#### `GET {tenant}.maidcentral.com/Report/SalesPipeline` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 8×
- Capabilities: reports
- Pages: `/Report/Kiosk`, `/Report/Kiosk#revenue_report_1`, `/Report/Kiosk#revenue_report_2`, `/Report/Kiosk#revenue_report_3`, `/Report/Kiosk#revenue_report_4`, `/Report/Kiosk#revenue_report_5`, `/Report/Kiosk#sidebar_tab_customer`, `/Report/Kiosk#sidebar_tab_employees`
- Query: `_` (:id)

#### `POST {tenant}.maidcentral.com/Report/SaveDataTableState` [xhr] (blocked during capture: write)

- Status: n/a · Auth: cookie · Returns: n/a · Seen 1×
- Capabilities: reports
- Pages: `/Report/EmployeeStats?End=:date&Start=:date`

<details><summary>Request body</summary>

```json
{
  "id": "string",
  "url": "string",
  "data": "string"
}
```
</details>

#### `GET {tenant}.maidcentral.com/Report/ScheduleEfficiencyMap` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 3×
- Capabilities: scheduling, reports
- Pages: `/Report/ScheduleEfficiencyMap`, `/Report/ScheduleEfficiencyMap?EndDate=*&StartDate=*`
- Query: `StartDate` (<string>); `EndDate` (<string>)

#### `GET {tenant}.maidcentral.com/Report/ScorecardResults` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: billing, reports
- Pages: `/Report/ScorecardResults`

#### `GET {tenant}.maidcentral.com/Report/SpotlightDashboard` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 3×
- Capabilities: reports
- Pages: `/Report/SpotlightDashboard`

#### `GET {tenant}.maidcentral.com/Report/TeamMileage` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: teams, reports
- Pages: `/Report/TeamMileage`

#### `GET {tenant}.maidcentral.com/Report/Tickets` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: reports
- Pages: `/Report/Tickets`

#### `GET {tenant}.maidcentral.com/Report/TimeChangeRequests` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: reports
- Pages: `/Report/TimeChangeRequests`

#### `GET {tenant}.maidcentral.com/Report/UtmReport` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 3×
- Capabilities: reports
- Pages: `/Report/UtmReport`, `/Report/UtmReport?endDate=:date&startDate=:date`
- Query: `startDate` (:date); `endDate` (:date)

#### `GET {tenant}.maidcentral.com/Report/ZipZoneList` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: reports, settings
- Pages: `/Report/ZipZoneList`

#### `GET {tenant}.maidcentral.com/Room` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Pages: `/Room`

#### `GET {tenant}.maidcentral.com/Schedule` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 7×
- Capabilities: scheduling
- Pages: `/Schedule`, `/Schedule?Date=:date`
- Query: `Date` (:date)

#### `POST {tenant}.maidcentral.com/Schedule/AbsentEmployees/` [xhr] (read via POST)

- Status: 200 · Auth: cookie · Returns: json · Seen 18×
- Capabilities: scheduling, employees
- Pages: `/Schedule`, `/Schedule#sidebar_tab_customer`, `/Schedule?Date=:date`

<details><summary>Request body</summary>

```json
{
  "date": "string"
}
```
</details>

<details><summary>Response shape</summary>

```json
[
  {
    "EmployeeInformationId": "number",
    "EmployeeTeamScheduleId": "number",
    "EmployeeName": "string",
    "TeamId": "number",
    "TeamDescription": "string",
    "TeamPositionId": "number",
    "DefaultTeamId": "number",
    "DefaultTeamDescription": "null",
    "DefaultTeamPositionModel": "null",
    "TeamPositionModel": "null",
    "StartTime": "string",
    "EndTime": "string",
    "EndDate": "string",
    "Approved": "boolean",
    "Excused": "boolean",
    "Late": "boolean",
    "Reason": "null",
    "ScheduleDate": "string",
    "OutCode": "string",
    "OutCodeColor": "string",
    "ListOfSchedules": "null",
    "Tags": "null",
    "Skills": "null",
    "CalendarUpdate": "null",
    "ScheduleExcuseApproval": "null",
    "OutCodeViewModel": "null",
    "Requests": "null",
    "HasTimeSheetsForScheduledDate": "boolean",
    "CountUnexcused": "null"
  }
]
```
</details>

#### `GET {tenant}.maidcentral.com/Schedule/GetSchedulerItemDetails` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 4×
- Capabilities: scheduling
- Pages: `/Schedule`, `/Schedule?Date=:date`
- Query: `id` (:id); `returnType` (:id); `date` (:date); `CalendarUpdate` (<string>); `_` (:id)
- Returns form `POST /Schedule/EditSchedulerItemDetails`: `__RequestVerificationToken:hidden`, `EmployeeTeamScheduleId:hidden`, `EmployeeInformationId:select-one`, `ScheduleDate:text`, `StartTime:text`, `EndDate:text`, `EndTime:text`, `OutCode:select-one`, `TeamId:select-one`, `TeamPositionId:select-one`, `Late:checkbox`, `Late:hidden`, `Reason:textarea`, `command:submit`

#### `GET {tenant}.maidcentral.com/Schedule/Read` [xhr]

- Status: 200 · Auth: cookie · Returns: json · Seen 10×
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

- Status: 200 · Auth: cookie · Returns: json · Seen 7×
- Capabilities: scheduling, employees
- Pages: `/Schedule`, `/Schedule?Date=:date`
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

- Status: 200 · Auth: cookie · Returns: json · Seen 7×
- Capabilities: scheduling, teams
- Pages: `/Schedule`, `/Schedule?Date=:date`
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

- Status: 200 · Auth: cookie · Returns: json · Seen 10×
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

#### `GET {tenant}.maidcentral.com/ServiceCompanyGoal/Create` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: settings
- Pages: `/ServiceCompanyGoal/Create`

#### `GET {tenant}.maidcentral.com/ServiceCompanyGoal/Quarterly` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: settings
- Pages: `/ServiceCompanyGoal/Quarterly`

#### `GET {tenant}.maidcentral.com/ServiceCompanyGroup/Authorization` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: settings
- Pages: `/ServiceCompanyGroup/Authorization`

#### `GET {tenant}.maidcentral.com/ServiceCompanyGroup/CreateOrUpdatePolicy/` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: settings
- Pages: `/ServiceCompanyGroup/Policies`
- Query: `id` (:id); `_` (:id)
- Returns form `POST /ServiceCompanyGroup/CreateOrUpdatePolicy`: `ServiceCompanyGroupPolicyId:hidden`, `ServiceCompanyGroupId:hidden`, `Name:text`, `PolicyTypeId:select-one`, `MinRequestIncrement:number`, `HoursInDay:text`, `PtoWaitingPeriod:number`, `PtoRequireUse:checkbox`, `PtoRequireUse:hidden`, `PtoMaxCarry:number`, `PtoCap:number`, `SickTimeSeparate:checkbox`, `SickTimeSeparate:hidden`, `SickWaitingPeriod:number`, `SickMaxCarry:number`, `SickCap:number`

#### `GET {tenant}.maidcentral.com/ServiceCompanyGroup/Policies` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 2×
- Capabilities: settings
- Pages: `/ServiceCompanyGroup/Policies`

#### `POST {tenant}.maidcentral.com/ServiceCompanyGroup/ShowAccessHistory` [xhr] (read via POST)

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: settings
- Pages: `/ServiceCompanyGroup/Authorization`

<details><summary>Request body</summary>

```json
{
  "id": "string"
}
```
</details>

#### `GET {tenant}.maidcentral.com/ServiceSetInformation/GetServiceSetInformation` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 4×
- Pages: `/HomeInformation/Details/:id?cid=:id&hid=:id&hsid=:id`, `/HomeInformation/Details/:id?cid=:id&hsid=:id`
- Query: `id` (:id); `hsid` (:id); `hid` (:id); `cid` (:id); `_` (:id)

#### `GET {tenant}.maidcentral.com/ServiceSetType` [page]

- Status: 302 · Auth: cookie · Returns: redirect · Seen 1×
- Pages: `/ServiceSetType`

#### `GET {tenant}.maidcentral.com/ServiceSetType` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Pages: `/Settings#tab_iframe`
- Query: `partial` (true); `_` (:id)

#### `POST {tenant}.maidcentral.com/ServiceSetType/GetServiceTypeGroupAvailability` [xhr] (read via POST)

- Status: 200 · Auth: cookie · Returns: json · Seen 3×
- Capabilities: scheduling, pricing
- Pages: `/Report/AvailabilityCalendarGroup`

<details><summary>Request body</summary>

```json
{
  "groupIds": [
    "number"
  ],
  "start": "number",
  "end": "number",
  "showFutureDateOnly": "boolean",
  "showOverrides": "boolean"
}
```
</details>

<details><summary>Response shape</summary>

```json
[
  {
    "url": "null",
    "late": "boolean",
    "outOfRotation": "boolean",
    "description": "string",
    "id": "string",
    "title": "string",
    "date": "string",
    "start": "null",
    "end": "null",
    "color": "string",
    "textColor": "string",
    "allDay": "boolean",
    "editable": "boolean"
  }
]
```
</details>

#### `GET {tenant}.maidcentral.com/Settings` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: settings
- Pages: `/Settings`

#### `GET {tenant}.maidcentral.com/Settings/AllDiscounts` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: pricing, settings
- Pages: `/Settings#tab_discount-all`
- Query: `_` (:id)

#### `GET {tenant}.maidcentral.com/Settings/AllRateAdjustments` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: pricing, settings
- Pages: `/Settings#tab_discount-all`
- Query: `_` (:id)

#### `POST {tenant}.maidcentral.com/Settings/CreateOrUpdateContactSubTypeModal` [xhr] (blocked during capture: write)

- Status: n/a · Auth: cookie · Returns: n/a · Seen 1×
- Capabilities: clients, settings
- Pages: `/Settings/Partner#tab_invoices`

#### `POST {tenant}.maidcentral.com/Settings/CreateOrUpdateOffice` [xhr] (blocked during capture: write)

- Status: n/a · Auth: cookie · Returns: n/a · Seen 1×
- Capabilities: settings
- Pages: `/Settings/Offices#tab_offices`

#### `GET {tenant}.maidcentral.com/Settings/Frames` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: settings
- Pages: `/Settings#tab_iframe`
- Query: `_` (:id)
- Returns form `GET (same)`: `ExternalServiceSetTypeGroupId:select-one`

#### `GET {tenant}.maidcentral.com/Settings/General` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 2×
- Capabilities: settings
- Pages: `/Settings#tab_general`
- Query: `_` (:id)
- Returns form `GET (same)`: `QuotingDefaultInternalServiceSetTypeGroupId:select-one`, `QuotingDefaultExternalServiceSetTypeGroupId:select-one`, `DisplayZipCodeCheck:checkbox`, `DisplayManualAddressInputs:checkbox`, `PriceRoundingDecimalPlace:hidden`, `PriceRoundingDigit:hidden`

#### `POST {tenant}.maidcentral.com/Settings/GetIFrameCode` [xhr] (read via POST)

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: settings
- Pages: `/Settings#tab_general`

<details><summary>Request body</summary>

```json
{
  "sstgId": "string",
  "sstIds": []
}
```
</details>

#### `GET {tenant}.maidcentral.com/Settings/Offices` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: settings
- Pages: `/Settings/Offices`

#### `GET {tenant}.maidcentral.com/Settings/OfficesPartial` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 2×
- Capabilities: settings
- Pages: `/Settings/Offices#tab_offices`
- Query: `_` (:id)

#### `GET {tenant}.maidcentral.com/Settings/Partner` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: settings
- Pages: `/Settings/Partner`

#### `GET {tenant}.maidcentral.com/Settings/PartnerBilling` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 3×
- Capabilities: billing, settings
- Pages: `/Settings/Partner#tab_billing`, `/Settings/Partner#tab_invoices`
- Query: `_` (:id)

#### `GET {tenant}.maidcentral.com/Settings/PartnerContactSubTypes` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 2×
- Capabilities: clients, settings
- Pages: `/Settings/Partner#tab_contactSubTypes`
- Query: `_` (:id)

#### `GET {tenant}.maidcentral.com/Settings/PartnerHolidays` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 2×
- Capabilities: settings
- Pages: `/Settings/Partner#tab_holidays`
- Query: `_` (:id)

#### `POST {tenant}.maidcentral.com/Settings/PartnerHolidaysCalendar` [xhr] (read via POST)

- Status: 200 · Auth: cookie · Returns: json · Seen 2×
- Capabilities: scheduling, settings
- Pages: `/Settings/Partner#tab_billing`, `/Settings/Partner#tab_holidays`

<details><summary>Request body</summary>

```json
{
  "start": "number",
  "end": "number"
}
```
</details>

<details><summary>Response shape</summary>

```json
[]
```
</details>

#### `GET {tenant}.maidcentral.com/Settings/PartnerInvoices` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 2×
- Capabilities: billing, settings
- Pages: `/Settings/Partner#tab_invoices`
- Query: `_` (:id)

#### `GET {tenant}.maidcentral.com/Settings/PartnerUi` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 2×
- Capabilities: settings
- Pages: `/Settings/Partner#tab_ui`
- Query: `_` (:id)
- Returns form `POST /Settings/PartnerUiUpdate`: `file:file`, `leftLoginFile:file`, `PrimaryColor:text`, `ResourceLinkUrl:text`, `GoogleAnalyticsKey:text`, `GoogleAnalyticsDomains:text`

#### `GET {tenant}.maidcentral.com/signalr/negotiate` [xhr]

- Status: 200 · Auth: cookie · Returns: json · Seen 3×
- Pages: `/Estimate/SalesPipeline?=:date`, `/Invoicing?JobDate=:date`
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

- Status: 200 · Auth: cookie · Returns: json · Seen 3×
- Pages: `/Estimate/SalesPipeline?=:date`, `/Invoicing?JobDate=:date`
- Query: `transport` (<string>); `clientProtocol` (<string>); `connectionToken` (<string>); `connectionData` (<string>); `_` (:id)

<details><summary>Response shape</summary>

```json
{
  "Response": "string"
}
```
</details>

#### `GET {tenant}.maidcentral.com/Skill` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Pages: `/Skill`

#### `GET {tenant}.maidcentral.com/Stripe/GetCustomerCards` [xhr]

- Status: 200 · Auth: cookie · Returns: html · Seen 2×
- Capabilities: clients, billing
- Pages: `/Customer/Details/:id?cid=:id#tab_stripe-status`
- Query: `id` (<string>); `cid` (:id); `_` (:id)

#### `GET {tenant}.maidcentral.com/Survey` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Pages: `/Survey`

#### `GET {tenant}.maidcentral.com/Tag` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: settings
- Pages: `/Tag`

#### `GET {tenant}.maidcentral.com/Team` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: teams
- Pages: `/Team`

#### `POST {tenant}.maidcentral.com/Template/GetTemplatesByType` [xhr] (read via POST)

- Status: 200 · Auth: cookie · Returns: json · Seen 4×
- Capabilities: settings
- Pages: `/Estimate/Details/:id`

<details><summary>Request body</summary>

```json
{
  "dataType": "string",
  "noteTypeId": "string"
}
```
</details>

<details><summary>Response shape</summary>

```json
[]
```
</details>

#### `POST {tenant}.maidcentral.com/Time/GetAllTimeChangeRequestsForEmployee` [xhr] (read via POST)

- Status: 200 · Auth: cookie · Returns: html · Seen 8×
- Capabilities: employees
- Pages: `/Employee/Dashboard`, `/Job/Worksheet/:id`

<details><summary>Request body</summary>

```json
{
  "employeeInformationId": "string",
  "minDateFilter": "string",
  "maxDateFilter": "string",
  "jobInformationId": "string"
}
```
</details>

#### `POST {tenant}.maidcentral.com/Time/ViewTimeRequestModal` [xhr] (read via POST)

- Status: 200 · Auth: cookie · Returns: html · Seen 10×
- Pages: `/Report/TimeChangeRequests?MaxDateFilterId=:date&MinDateFilterId=:date`
- Returns form `GET (same)`: 

<details><summary>Request body</summary>

```json
{
  "id": "string",
  "changeRequestType": "string"
}
```
</details>

#### `GET {tenant}.maidcentral.com/User` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: employees
- Pages: `/User`

#### `GET {tenant}.maidcentral.com/view-resources/Views/Note/_NoteModal.js` [xhr]

- Status: 200 · Auth: cookie · Returns: text · Seen 4×
- Capabilities: notes-messages
- Pages: `/Estimate/Details/:id`
- Query: `_` (:id)

#### `GET {tenant}.maidcentral.com/view-resources/Views/ServiceCompanyGroup/_AccessHistoryModal.js` [xhr]

- Status: 200 · Auth: cookie · Returns: text · Seen 1×
- Capabilities: settings
- Pages: `/ServiceCompanyGroup/Authorization`
- Query: `_` (:id)

#### `GET {tenant}.maidcentral.com/view-resources/Views/Time/_ViewTimeRequestModal.js` [xhr]

- Status: 200 · Auth: cookie · Returns: text · Seen 1×
- Pages: `/Report/TimeChangeRequests?MaxDateFilterId=:date&MinDateFilterId=:date`
- Query: `_` (:id)

#### `POST {tenant}.maidcentral.com/webhook/getWebhookSubscriptions` [xhr] (read via POST)

- Status: 200 · Auth: cookie · Returns: json · Seen 1×
- Pages: `/Webhook/Subscriptions`
- Query: `statusId` (:id); `sorting` (<string>); `skipCount` (:id); `maxResultCount` (:id)

<details><summary>Response shape</summary>

```json
{
  "TotalCount": "number",
  "Items": []
}
```
</details>

#### `GET {tenant}.maidcentral.com/Webhook/Subscriptions` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Pages: `/Webhook/Subscriptions`

#### `GET {tenant}.maidcentral.com/Zone` [page]

- Status: 200 · Auth: cookie · Returns: html · Seen 1×
- Capabilities: settings
- Pages: `/Zone`

#### `GET {tenant}.maidcentral.com/Zone/GetMapJson` [xhr]

- Status: 200 · Auth: cookie · Returns: json · Seen 4×
- Capabilities: settings
- Pages: `/Report/CustomerEfficiencyMap`, `/Report/ScheduleEfficiencyMap?EndDate=:date&StartDate=:date`

<details><summary>Response shape</summary>

```json
{
  "type": "string",
  "features": [
    {
      "type": "string",
      "geometry": {
        "type": "string",
        "coordinates": [
          [
            [
              "array|number"
            ]
          ]
        ]
      },
      "properties": {
        "zipCode": "string",
        "country": "string",
        "city": "string",
        "county": "string",
        "state": "string",
        "fill": "string"
      }
    }
  ]
}
```
</details>

#### `POST maps.googleapis.com/$rpc/google.internal.maps.mapsjs.v1.MapsJsInternalService/GetViewportInfo` [xhr] (blocked during capture: write)

- Status: n/a · Auth: cookie · Returns: n/a · Seen 4×
- Pages: `/Report/CustomerEfficiencyMap`, `/Report/ScheduleEfficiencyMap?EndDate=:date&StartDate=:date`

<details><summary>Request body</summary>

```json
[
  "array|null|number|string"
]
```
</details>

#### `GET maps.googleapis.com/maps/api/mapsjs/gen_204` [xhr]

- Status: 200 · Auth: cookie · Returns: json · Seen 48×
- Pages: `/Company/Settings`, `/Customer/Create`, `/Employee/Create`, `/Employee/Dashboard`, `/Employee/Details/:id`, `/Employee/Time#monitor-tab`, `/Employee/Time#sidebar_tab_customer`, `/Invoicing?JobDate=:date`, `/Property/Create`, `/Report/CustomerEfficiencyMap`, `/Report/ScheduleEfficiencyMap?EndDate=:date&StartDate=:date`
- Query: `csp_test` (true)

<details><summary>Response shape</summary>

```json
{}
```
</details>

#### `GET maps.googleapis.com/maps/api/mapsjs/mapConfigs:batchGet` [xhr]

- Status: 200 · Auth: cookie · Returns: json · Seen 4×
- Capabilities: settings
- Pages: `/Report/CustomerEfficiencyMap`, `/Report/ScheduleEfficiencyMap?EndDate=:date&StartDate=:date`
- Query: `language` (<string>); `region` (<string>); `alt` (protojson); `major_version` (:id); `minor_version` (<string>); `map_ids` (:id, <string>); `map_type` (:id)

<details><summary>Response shape</summary>

```json
[
  "array|string"
]
```
</details>
