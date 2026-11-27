// Starts the field test recorder (field-test.service.ts). A production build swaps this file
// for field-test.prod.ts (angular.json, fileReplacements), so no field test code is in it.

import { inject } from '@angular/core';

import { FieldTestService } from './field-test.service';

/** Call in an injection context, such as the app component's constructor. */
export function startFieldTest(): void {
  inject(FieldTestService);
}
