import { Action, ActionReducer } from '@ngrx/store';

import { ALL_NGRX_FORMS_ACTION_TYPES } from './actions';
import { formArrayReducer } from './array/reducer';
import { formControlReducer } from './control/reducer';
import { formGroupReducer } from './group/reducer';
import { AbstractControlState, FormControlState, FormState, isArrayState, isFormState, isGroupState } from './state';
import { ProjectFn } from './update-function/util';

export function formStateReducer<TValue>(
  state: FormState<TValue> | AbstractControlState<TValue> | undefined,
  action: Action,
): FormState<TValue> {
  if (!state) {
    throw new Error('The form state must be defined!');
  }

  if (!isFormState(state)) {
    throw new Error(`state must be a form state, got ${state}`);
  }

  if (isGroupState(state)) {
    return formGroupReducer(state, action) as any;
  }

  if (isArrayState(state)) {
    return formArrayReducer(state, action) as any;
  }

  return formControlReducer(state as FormControlState<any>, action) as any;
}

/**
 * This function creates a reducer function that first applies an action to the state
 * and afterwards applies all given update functions one after another to the resulting
 * form state. However, the update functions are only applied if the form state changed
 * as result of applying the action. If you need the update functions to be applied
 * regardless of whether the state changed (e.g. because the update function closes
 * over variables that may change independently of the form state) you can simply apply
 * the update manually (e.g. `updateFunction(formStateReducer(state, action))`).
 *
 * The following (contrived) example uses this function to create a reducer that after
 * each action validates the child control `name` to be required and sets the child
 * control `email`'s value to be `''` if the name is invalid.
 *
 * ```typescript
 * interface FormValue {
 *   name: string;
 *   email: string;
 * }
 *
 * const updateFormState = updateGroup<FormValue>(
 *   {
 *     name: validate(required),
 *   },
 *   {
 *     email: (email, parentGroup) =>
 *       parentGroup.controls.name.isInvalid
 *         ? setValue('', email)
 *         : email,
 *   },
 * );
 *
 * const reducer = createFormStateReducerWithUpdate<FormValue>(updateFormState);
 * ```
 */
export function createFormStateReducerWithUpdate<TValue>(
  updateFnOrUpdateFnArr: ProjectFn<FormState<TValue>> | ProjectFn<FormState<TValue>>[],
  ...updateFnArr: ProjectFn<FormState<TValue>>[]
): ActionReducer<FormState<TValue>> {
  updateFnArr = [...(Array.isArray(updateFnOrUpdateFnArr) ? updateFnOrUpdateFnArr : [updateFnOrUpdateFnArr]), ...updateFnArr];
  return (state: FormState<TValue> | undefined, action: Action): FormState<TValue> => {
    const newState = formStateReducer(state as AbstractControlState<TValue>, action);
    return newState === state ? state : updateFnArr.reduce((s, f) => f(s), newState);
  };
}

/**
 * This function returns an object that can be passed to ngrx's `createReducer`
 * function (available starting with ngrx version 8). By doing this all form
 * state properties on the state will be updated whenever necessary (i.e.
 * whenever an ngrx-forms action is dispatched).
 *
 * To manually update a form state (e.g. to validate it) use
 * `wrapReducerWithFormStateUpdate`.
 */
export function onNgrxForms<TState = any>(): { reducer: ActionReducer<TState>; types: string[] } {
  function reduceNestedFormState(state: TState, key: keyof TState, action: Action): TState {
    const value = state[key];

    if (!isFormState(value)) {
      return state;
    }

    return {
      ...state,
      [key]: formStateReducer(value, action),
    };
  }

  return {
    reducer: (state, action) =>
      Object.keys(state!).reduce((s, key) => reduceNestedFormState(s, key as keyof TState, action)!, state!),
    types: ALL_NGRX_FORMS_ACTION_TYPES,
  };
}

/**
 * This function wraps a reducer and returns another reducer that first calls
 * the given reducer and then calls the given update function for the form state
 * that is specified by the form state locator function.
 */
export function wrapReducerWithFormStateUpdate<TState, TFormState extends AbstractControlState<any>>(
  reducer: ActionReducer<TState>,
  formStateLocator: (state: TState) => TFormState,
  updateFn: (formState: TFormState) => TFormState,
): ActionReducer<TState> {
  return (state, action) => {
    const updatedState = reducer(state, action);

    const formState = formStateLocator(updatedState);
    const formStateKey = Object.keys(updatedState).find(key => updatedState[key as keyof TState] as any === formState)!;

    const updatedFormState = updateFn(formState);

    if (updatedFormState === formState) {
      return updatedState;
    }

    return {
      ...updatedState,
      [formStateKey]: updatedFormState,
    };
  };
}
